import * as FileSystem from 'expo-file-system/legacy';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { getSupabaseClient } from '@/lib/supabase';
import type {
  ChatMessage,
  ChatPreview,
  CompatibilityResult,
  DiscoverProfile,
  LikeItem,
  ProfileDetail,
  UserProfile,
} from '@/constants/mock-data';

export type KundliSummary = {
  generatedAt: string;
  ascendant?: string;
  moonSign?: string;
  sunSign?: string;
  nakshatra?: string;
  gana?: string;
  nadi?: string;
  manglik?: string;
  yogas: string[];
  doshas: string[];
  overview: string;
  raw?: Record<string, unknown>;
  rawResponse?: Record<string, unknown>;
  chartImages?: KundliChartImage[];
};

/** Signed chart URLs live this long; the Kundli query refetches before they expire. */
export const KUNDLI_CHART_URL_TTL_SECONDS = 60 * 60;

export type KundliChartImage = {
  chartId: string;
  path: string;
  signedUrl: string;
};

export type PushTokenRegistration = {
  token: string;
  platform: string;
};

type ProfileRow = {
  id: string;
  phone: string | null;
  email: string | null;
  display_name: string | null;
  gender: string | null;
  gender_preferences: string[];
  height: string | null;
  date_of_birth: string | null;
  time_of_birth: string | null;
  birth_place: string | null;
  birth_latitude: number | null;
  birth_longitude: number | null;
  birth_timezone: string | null;
  kundli_generation_status: 'pending' | 'generated' | 'failed';
  location: string | null;
  bio: string | null;
  family_plans: string | null;
  family_plans_visible_on_profile: boolean;
  workplace: string | null;
  workplace_visible_on_profile: boolean;
  job_role: string | null;
  job_role_visible_on_profile: boolean;
  school: string | null;
  school_visible_on_profile: boolean;
  education_level: string | null;
  education_level_visible_on_profile: boolean;
  religious_beliefs: string | null;
  drinking: string | null;
  drinking_visible_on_profile: boolean;
  smoking: string | null;
  smoking_visible_on_profile: boolean;
  photo_urls: string[];
  onboarding_completed: boolean;
  created_at: string;
  updated_at: string;
};

type ProfilePhotoRow = {
  user_id: string;
  storage_path: string;
  sort_order: number;
};

/** Row shape of the public.profile_cards view (also embedded as JSON by the RPCs). */
type ProfileCardRow = Omit<ProfileRow, 'phone' | 'email' | 'time_of_birth' | 'birth_latitude' | 'birth_longitude' | 'birth_timezone' | 'kundli_generation_status' | 'photo_urls' | 'updated_at'> & {
  photo_paths: string[] | null;
};

type IncomingLikeRow = {
  id: string;
  from_user_id: string;
  opening_message: string | null;
  created_at: string;
  compatibility_report: CompatibilityResult | null;
  profile: ProfileCardRow | null;
};

type ChatPreviewRow = {
  id: string;
  created_at: string;
  updated_at: string;
  hidden: boolean;
  participant_id: string;
  compatibility_report: CompatibilityResult | null;
  last_message: Omit<MessageRow, 'chat_id'> | null;
  unread_count: number;
  participant: ProfileCardRow | null;
};

type KundliRow = {
  parsed_summary: KundliSummary;
  raw_response: Record<string, unknown>;
  chart_image_paths: Record<string, string> | null;
  generated_at: string;
};

// Reads the locally persisted session. Unlike auth.getUser() this makes no network request;
// the server still enforces identity through RLS on every query.
async function getSessionUser() {
  const { data, error } = await getSupabaseClient().auth.getSession();
  if (error) throw error;
  return data.session?.user ?? null;
}

async function requireSessionUser() {
  const user = await getSessionUser();
  if (!user) {
    throw new Error('No authenticated Supabase user found.');
  }
  return user;
}

type MessageRow = {
  id: string;
  chat_id: string;
  sender_id: string;
  body: string;
  status: 'sent' | 'read';
  read_at: string | null;
  created_at: string;
};

type SentChatMessageResult = {
  id: string;
  createdAt: string;
  senderId: 'me';
  text: string;
  status?: 'sent' | 'read';
};

function maskPhone(phone: string) {
  return phone.replace(/.(?=.{4})/g, '*');
}

function toDatabaseDate(value: string) {
  if (!value) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  const match = value.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!match) {
    return null;
  }

  return `${match[3]}-${match[2]}-${match[1]}`;
}

function toProfileDate(value: string | null) {
  if (!value) {
    return '';
  }

  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return value;
  }

  return `${match[3]}-${match[2]}-${match[1]}`;
}

function getPhotoContentType(uri: string) {
  const extension = uri.split('?')[0]?.split('.').pop()?.toLowerCase();

  if (extension === 'png') {
    return { extension, contentType: 'image/png' };
  }

  if (extension === 'webp') {
    return { extension, contentType: 'image/webp' };
  }

  return { extension: 'jpg', contentType: 'image/jpeg' };
}

function base64ToArrayBuffer(base64: string) {
  const binary = globalThis.atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes.buffer;
}

function calculateAge(dateOfBirth: string | null) {
  if (!dateOfBirth) {
    return 0;
  }

  const birthDate = new Date(`${dateOfBirth}T00:00:00.000Z`);
  if (Number.isNaN(birthDate.getTime())) {
    return 0;
  }

  const today = new Date();
  let age = today.getUTCFullYear() - birthDate.getUTCFullYear();
  const monthDelta = today.getUTCMonth() - birthDate.getUTCMonth();

  if (monthDelta < 0 || (monthDelta === 0 && today.getUTCDate() < birthDate.getUTCDate())) {
    age -= 1;
  }

  return Math.max(age, 0);
}

function createCompatibility(profileId: string): CompatibilityResult {
  const seed = [...profileId].reduce((total, char) => total + char.charCodeAt(0), 0);
  const score = 72 + (seed % 19);

  return {
    id: `compat-${profileId}`,
    generatedAt: new Date().toISOString(),
    overallScore: score,
    summary:
      'your charts are ready for a kundli match once you initiate interest and generate the detailed score.',
    yogas: ['Gajkesari', 'Dhan'],
    doshas: score > 82 ? ['None prominent'] : ['Needs review'],
    breakdown: [
      { label: 'Guna Milan', value: Math.min(score + 6, 96) },
      { label: 'Nadi Compatibility', value: Math.max(score - 8, 60) },
      { label: 'Bhakoot/Rashi Matching', value: Math.min(score + 3, 98) },
      { label: 'Overall Match', value: score },
    ],
  };
}

function timeAgo(value: string) {
  const createdAt = new Date(value).getTime();
  const elapsedMs = Date.now() - createdAt;

  if (!Number.isFinite(createdAt) || elapsedMs < 0) {
    return 'Just now';
  }

  const elapsedMinutes = Math.floor(elapsedMs / 60000);
  if (elapsedMinutes < 1) {
    return 'Just now';
  }

  if (elapsedMinutes < 60) {
    return `${elapsedMinutes}m ago`;
  }

  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) {
    return `${elapsedHours}h ago`;
  }

  const elapsedDays = Math.floor(elapsedHours / 24);
  return `${elapsedDays}d ago`;
}

function addDetail(details: ProfileDetail[], label: string, icon: ProfileDetail['icon'], text?: string | null) {
  if (!text) {
    return;
  }

  details.push({ label, icon, text });
}

function profilePhotoUrl(storagePath: string) {
  return getSupabaseClient().storage.from('profile-photos').getPublicUrl(storagePath).data.publicUrl;
}

function profileCardToDiscoverProfile(card: ProfileCardRow) {
  return profileRowToDiscoverProfile(card, (card.photo_paths ?? []).map(profilePhotoUrl));
}

function profileRowToDiscoverProfile(
  row: Omit<ProfileCardRow, 'photo_paths'>,
  photos: string[]
): DiscoverProfile | null {
  const name = row.display_name?.trim() || 'KundaliKonnect Member';

  if (!row.id) {
    return null;
  }

  const details: ProfileDetail[] = [];
  addDetail(details, 'gender', 'person-outline', row.gender);
  addDetail(details, 'preference', 'magnet-outline', row.gender_preferences?.join(', '));
  addDetail(details, 'height', 'resize-outline', row.height);

  const work = [
    row.job_role_visible_on_profile ? row.job_role : null,
    row.workplace_visible_on_profile ? row.workplace : null,
  ]
    .filter(Boolean)
    .join(', ');
  addDetail(details, 'work', 'briefcase-outline', work);

  const education = [
    row.education_level_visible_on_profile ? row.education_level : null,
    row.school_visible_on_profile ? row.school : null,
  ]
    .filter(Boolean)
    .join(', ');
  addDetail(details, 'education', 'school-outline', education);

  addDetail(details, 'religion', 'sparkles-outline', row.religious_beliefs);

  if (row.family_plans_visible_on_profile) {
    addDetail(details, 'family', 'people-outline', row.family_plans);
  }

  if (row.drinking_visible_on_profile) {
    addDetail(details, 'drinking', 'wine-outline', row.drinking);
  }

  if (row.smoking_visible_on_profile) {
    addDetail(details, 'smoking', 'cloud-outline', row.smoking);
  }

  const bio = row.bio?.trim() || 'Looking for a meaningful connection.';

  return {
    id: row.id,
    createdAt: row.created_at,
    name,
    age: calculateAge(row.date_of_birth),
    gender: row.gender || '',
    location: row.location || row.birth_place || 'India',
    bio,
    prompt: bio,
    photos,
    details,
    compatibility: createCompatibility(row.id),
  };
}

export async function requestPhoneOtp(phone: string) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.signInWithOtp({
    phone,
  });

  if (error) {
    console.warn('Supabase phone OTP request failed', {
      phone: maskPhone(phone),
      code: error.code,
      message: error.message,
      status: error.status,
    });
    throw error;
  }

  console.info('Supabase phone OTP requested', { phone: maskPhone(phone) });
  return data;
}

export async function verifyPhoneOtp(phone: string, token: string) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.verifyOtp({
    phone,
    token,
    type: 'sms',
  });

  if (error) {
    console.warn('Supabase phone OTP verification failed', {
      phone: maskPhone(phone),
      code: error.code,
      message: error.message,
      status: error.status,
    });
    throw error;
  }

  return data;
}

export async function ensureCurrentUserProfile() {
  const supabase = getSupabaseClient();
  const user = await getSessionUser();

  if (!user) {
    throw new Error('No authenticated Supabase user found.');
  }

  const { error } = await supabase.from('profiles').upsert(
    {
      id: user.id,
      phone: user.phone || null,
      email: user.email || null,
    },
    { onConflict: 'id', ignoreDuplicates: true }
  );

  if (error) {
    throw error;
  }

  return user;
}

export async function getCurrentUserProfile() {
  const supabase = getSupabaseClient();
  const user = await getSessionUser();

  if (!user) {
    return null;
  }

  const { data, error } = await supabase
    .from('profiles')
    .select(
      [
        'id',
        'phone',
        'email',
        'display_name',
        'gender',
        'gender_preferences',
        'height',
        'date_of_birth',
        'time_of_birth',
        'birth_place',
        'birth_latitude',
        'birth_longitude',
        'birth_timezone',
        'kundli_generation_status',
        'location',
        'bio',
        'family_plans',
        'family_plans_visible_on_profile',
        'workplace',
        'workplace_visible_on_profile',
        'job_role',
        'job_role_visible_on_profile',
        'school',
        'school_visible_on_profile',
        'education_level',
        'education_level_visible_on_profile',
        'religious_beliefs',
        'drinking',
        'drinking_visible_on_profile',
        'smoking',
        'smoking_visible_on_profile',
        'onboarding_completed',
        'created_at',
        'updated_at',
        'profile_photos(storage_path, sort_order)',
      ].join(', ')
    )
    .eq('id', user.id)
    .order('sort_order', { referencedTable: 'profile_photos', ascending: true })
    .single<Omit<ProfileRow, 'photo_urls'> & { profile_photos: Omit<ProfilePhotoRow, 'user_id'>[] | null }>();

  if (error) {
    throw error;
  }

  const { profile_photos: photoRows, ...row } = data;

  return {
    ...row,
    photo_urls: (photoRows ?? []).map((photo) => profilePhotoUrl(photo.storage_path)),
  };
}

export async function getDiscoverProfiles() {
  const { data, error } = await getSupabaseClient().rpc('get_discover_profiles', { p_limit: 50 });

  if (error) {
    throw error;
  }

  return ((data ?? []) as ProfileCardRow[])
    .map(profileCardToDiscoverProfile)
    .filter((profile): profile is DiscoverProfile => Boolean(profile));
}

export async function getPendingIncomingLikes() {
  const { data, error } = await getSupabaseClient().rpc('get_incoming_likes');

  if (error) {
    throw error;
  }

  return ((data ?? []) as IncomingLikeRow[])
    .map((like): LikeItem | null => {
      const fromProfile = like.profile ? profileCardToDiscoverProfile(like.profile) : null;
      if (!like.profile || !fromProfile) {
        return null;
      }

      const compatibility = like.compatibility_report ?? createCompatibility(like.from_user_id);

      return {
        id: like.id,
        createdAt: like.created_at,
        fromProfileId: like.from_user_id,
        fromProfile: { ...fromProfile, compatibility },
        fromName: fromProfile.name,
        age: fromProfile.age,
        location: fromProfile.location,
        avatarUrl: fromProfile.photos[0] ?? '',
        openingMessage: like.opening_message?.trim() || 'Sent you a like.',
        note: like.profile.bio?.trim() || 'Interested in connecting.',
        timeAgo: timeAgo(like.created_at),
        compatibility,
      };
    })
    .filter((like): like is LikeItem => Boolean(like));
}

function mapMessageRow(message: MessageRow, currentUserId: string): ChatMessage {
  const isMine = message.sender_id === currentUserId;

  return {
    id: message.id,
    createdAt: message.created_at,
    senderId: isMine ? 'me' : message.sender_id,
    text: message.body,
    status: message.status,
    ...(isMine && message.status === 'read' && message.read_at ? { seenAt: message.read_at } : {}),
    ...(!isMine && message.read_at ? { readAt: message.read_at } : {}),
  };
}

async function getChatMessagesPage(
  chatId: string,
  currentUserId: string,
  options?: { before?: string; limit?: number }
) {
  const supabase = getSupabaseClient();
  const limit = options?.limit ?? 30;
  let query = supabase
    .from('messages')
    .select('id, chat_id, sender_id, body, status, read_at, created_at')
    .eq('chat_id', chatId)
    .order('created_at', { ascending: false });

  if (options?.before) {
    query = query.lt('created_at', options.before);
  }

  const { data, error } = await query.limit(limit + 1).returns<MessageRow[]>();

  if (error) {
    throw error;
  }

  const rows = data ?? [];
  const pageRows = rows.slice(0, limit).reverse();

  return {
    messages: pageRows.map((message) => mapMessageRow(message, currentUserId)),
    hasMoreMessages: rows.length > limit,
  };
}

export async function getChatMessages(
  chatId: string,
  options?: { before?: string; limit?: number }
) {
  const user = await getSessionUser();

  if (!user) {
    return { messages: [], hasMoreMessages: false };
  }

  return getChatMessagesPage(chatId, user.id, options);
}

export async function getChats() {
  const user = await getSessionUser();

  if (!user) {
    return [];
  }

  const { data, error } = await getSupabaseClient().rpc('get_chat_previews');

  if (error) {
    throw error;
  }

  return ((data ?? []) as ChatPreviewRow[]).map((chat): ChatPreview => {
    const participantProfile = chat.participant ? profileCardToDiscoverProfile(chat.participant) : null;
    const lastMessage = chat.last_message
      ? mapMessageRow({ ...chat.last_message, chat_id: chat.id }, user.id)
      : null;
    const compatibility = chat.compatibility_report;

    return {
      id: chat.id,
      createdAt: chat.created_at,
      updatedAt: chat.updated_at,
      participantId: chat.participant_id,
      ...(participantProfile ? { participantProfile } : {}),
      name: participantProfile?.name ?? 'KundaliKonnect Member',
      avatarUrl: participantProfile?.photos[0] ?? '',
      lastMessage: lastMessage?.text ?? 'Start the conversation',
      unreadCount: chat.unread_count,
      hidden: chat.hidden,
      compatibilityScore: compatibility?.overallScore ?? createCompatibility(chat.participant_id).overallScore,
      ...(compatibility ? { compatibility } : {}),
      hasMoreMessages: false,
      messages: lastMessage ? [lastMessage] : [],
    };
  });
}

export async function sendMessage(chatId: string, text: string) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.functions.invoke<{ message: SentChatMessageResult }>('send-chat-message', {
    body: {
      chatId,
      text,
    },
  });

  if (error) {
    throw error;
  }

  const message = data?.message ?? null;
  if (!message) {
    throw new Error('Message send did not return a message record.');
  }

  return {
    id: message.id,
    createdAt: message.createdAt,
    senderId: 'me',
    text: message.text,
    status: message.status ?? 'sent',
  } satisfies ChatMessage;
}

export async function markChatRead(chatId: string) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc('mark_chat_read', {
    p_chat_id: chatId,
  });

  if (error) {
    throw error;
  }

  return data as string;
}

export function applyProfileRow(profile: UserProfile, row: ProfileRow): UserProfile {
  return {
    ...profile,
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    name: row.display_name || profile.name,
    email: row.email || profile.email,
    dateOfBirth: toProfileDate(row.date_of_birth) || profile.dateOfBirth,
    timeOfBirth: row.time_of_birth || profile.timeOfBirth,
    gender: row.gender || profile.gender,
    genderPreferences: row.gender_preferences ?? profile.genderPreferences,
    height: row.height || profile.height,
    location: row.location || profile.location,
    bio: row.bio || profile.bio,
    familyPlans: row.family_plans || profile.familyPlans,
    familyPlansVisibleOnProfile: row.family_plans_visible_on_profile,
    workplace: row.workplace || profile.workplace,
    workplaceVisibleOnProfile: row.workplace_visible_on_profile,
    jobRole: row.job_role || profile.jobRole,
    jobRoleVisibleOnProfile: row.job_role_visible_on_profile,
    school: row.school || profile.school,
    schoolVisibleOnProfile: row.school_visible_on_profile,
    educationLevel: row.education_level || profile.educationLevel,
    educationLevelVisibleOnProfile: row.education_level_visible_on_profile,
    religiousBeliefs: row.religious_beliefs || profile.religiousBeliefs,
    drinking: row.drinking || profile.drinking,
    drinkingVisibleOnProfile: row.drinking_visible_on_profile,
    smoking: row.smoking || profile.smoking,
    smokingVisibleOnProfile: row.smoking_visible_on_profile,
    photoUris: row.photo_urls ?? profile.photoUris,
    phoneNumber: row.phone || profile.phoneNumber,
    birthPlace: row.birth_place || profile.birthPlace,
    birthLatitude: row.birth_latitude === null ? profile.birthLatitude : String(row.birth_latitude),
    birthLongitude: row.birth_longitude === null ? profile.birthLongitude : String(row.birth_longitude),
    birthTimezone: row.birth_timezone || profile.birthTimezone,
    kundliStatus: row.kundli_generation_status || profile.kundliStatus,
  };
}

function toNullableNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function updateCurrentUserProfile(profile: UserProfile, options?: { onboardingCompleted?: boolean }) {
  const supabase = getSupabaseClient();
  const user = await requireSessionUser();

  const updates = {
    id: user.id,
    phone: profile.phoneNumber || user.phone || null,
    email: profile.email || user.email || null,
    display_name: profile.name || null,
    gender: profile.gender || null,
    gender_preferences: profile.genderPreferences ?? [],
    height: profile.height || null,
    date_of_birth: toDatabaseDate(profile.dateOfBirth),
    time_of_birth: profile.timeOfBirth || null,
    birth_place: profile.birthPlace || null,
    birth_latitude: toNullableNumber(profile.birthLatitude),
    birth_longitude: toNullableNumber(profile.birthLongitude),
    birth_timezone: profile.birthTimezone || null,
    kundli_generation_status: profile.kundliStatus,
    location: profile.location || null,
    bio: profile.bio || null,
    family_plans: profile.familyPlans || null,
    family_plans_visible_on_profile: profile.familyPlansVisibleOnProfile,
    workplace: profile.workplace || null,
    workplace_visible_on_profile: profile.workplaceVisibleOnProfile,
    job_role: profile.jobRole || null,
    job_role_visible_on_profile: profile.jobRoleVisibleOnProfile,
    school: profile.school || null,
    school_visible_on_profile: profile.schoolVisibleOnProfile,
    education_level: profile.educationLevel || null,
    education_level_visible_on_profile: profile.educationLevelVisibleOnProfile,
    religious_beliefs: profile.religiousBeliefs || null,
    drinking: profile.drinking || null,
    drinking_visible_on_profile: profile.drinkingVisibleOnProfile,
    smoking: profile.smoking || null,
    smoking_visible_on_profile: profile.smokingVisibleOnProfile,
    updated_at: new Date().toISOString(),
    ...(options?.onboardingCompleted === undefined
      ? {}
      : { onboarding_completed: options.onboardingCompleted }),
  };

  const { error } = await supabase.from('profiles').upsert(updates, { onConflict: 'id' });

  if (error) {
    throw error;
  }
}

export async function generateCurrentUserKundli() {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.functions.invoke<{ parsed_summary: KundliSummary }>('generate-kundli');

  if (error) {
    throw error;
  }

  if (!data?.parsed_summary) {
    throw new Error('Kundli generation did not return a summary.');
  }

  return data.parsed_summary;
}

export async function generateMatchScore(targetProfileId: string) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.functions.invoke<{ compatibility: CompatibilityResult }>(
    'generate-match-score',
    {
      body: { targetProfileId },
    }
  );

  if (error) {
    throw error;
  }

  if (!data?.compatibility) {
    throw new Error('Match-making did not return a compatibility report.');
  }

  return data.compatibility;
}

export async function createLike(targetProfileId: string, openingMessage: string) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.functions.invoke<{ like: { id: string } }>('create-like', {
    body: { targetProfileId, openingMessage },
  });

  if (error) {
    throw error;
  }

  if (!data?.like) {
    throw new Error('Like creation did not return a like record.');
  }

  return data.like;
}

export async function replyToLike(likeId: string, message: string) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.functions.invoke<{ chatId: string }>('reply-to-like', {
    body: { likeId, message },
  });

  if (error) {
    throw error;
  }

  if (!data?.chatId) {
    throw new Error('Reply did not return a chat.');
  }

  return data.chatId;
}

function getExpoProjectId() {
  return Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId;
}

export async function registerCurrentUserPushToken(
  options: { requestPermission?: boolean } = {}
): Promise<PushTokenRegistration | null> {
  const supabase = getSupabaseClient();
  // upsert_own_push_token reads auth.uid() itself; this just fails fast when signed out.
  await requireSessionUser();

  const existingPermission = await Notifications.getPermissionsAsync();
  let isGranted = existingPermission.granted;
  const requestPermission = options.requestPermission ?? true;

  if (!isGranted && requestPermission) {
    const requestedPermission = await Notifications.requestPermissionsAsync();
    isGranted = requestedPermission.granted;
  }

  if (!isGranted) {
    return null;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#E9B949',
    });
  }

  const projectId = getExpoProjectId();
  const expoPushToken = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
  const token = expoPushToken.data;
  const platform = Platform.OS;
  const now = new Date().toISOString();

  const { error } = await supabase.rpc('upsert_own_push_token', {
    p_token: token,
    p_platform: platform,
    p_token_type: 'expo',
    p_updated_at: now,
  });

  if (error) {
    throw error;
  }

  return { token, platform };
}

async function deleteCurrentUserPushTokens() {
  const supabase = getSupabaseClient();
  const user = await getSessionUser();

  if (!user) {
    return;
  }

  const existingPermission = await Notifications.getPermissionsAsync();

  if (!existingPermission.granted) {
    return;
  }

  const projectId = getExpoProjectId();
  const expoPushToken = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
  const { error } = await supabase
    .from('push_tokens')
    .delete()
    .eq('user_id', user.id)
    .eq('token', expoPushToken.data);

  if (error) {
    throw error;
  }
}

export async function getCurrentUserKundliSummary() {
  const supabase = getSupabaseClient();
  const user = await getSessionUser();

  if (!user) {
    return null;
  }

  const { data, error } = await supabase
    .from('kundlis')
    .select('parsed_summary, raw_response, chart_image_paths, generated_at')
    .eq('user_id', user.id)
    .maybeSingle<KundliRow>();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  const charts = Object.entries(data.chart_image_paths ?? {});
  const { data: signedUrls } =
    charts.length > 0
      ? await supabase.storage.from('kundli-charts').createSignedUrls(
          charts.map(([, path]) => path),
          KUNDLI_CHART_URL_TTL_SECONDS
        )
      : { data: [] };
  const signedUrlByPath = new Map(
    (signedUrls ?? []).filter((item) => item.signedUrl && !item.error).map((item) => [item.path, item.signedUrl])
  );

  return {
    ...data.parsed_summary,
    generatedAt: data.parsed_summary.generatedAt || data.generated_at,
    rawResponse: data.raw_response,
    chartImages: charts
      .map(([chartId, path]) => ({ chartId, path, signedUrl: signedUrlByPath.get(path) ?? '' }))
      .filter((image): image is KundliChartImage => Boolean(image.signedUrl)),
  };
}

export async function uploadCurrentUserProfilePhoto(uri: string, sortOrder: number) {
  const supabase = getSupabaseClient();
  const user = await requireSessionUser();

  const { extension, contentType } = getPhotoContentType(uri);
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const fileBuffer = base64ToArrayBuffer(base64);

  if (fileBuffer.byteLength === 0) {
    throw new Error('Selected photo could not be read from the device.');
  }

  const storagePath = `${user.id}/${Date.now()}-${sortOrder}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from('profile-photos')
    .upload(storagePath, fileBuffer, {
      contentType,
      upsert: false,
    });

  if (uploadError) {
    throw uploadError;
  }

  const { data: uploadedFiles, error: listError } = await supabase.storage
    .from('profile-photos')
    .list(user.id, {
      search: storagePath.split('/').pop(),
    });

  if (listError) {
    await supabase.storage.from('profile-photos').remove([storagePath]);
    throw listError;
  }

  const uploadedFile = uploadedFiles?.find((item) => item.name === storagePath.split('/').pop());
  if (!uploadedFile?.metadata?.size) {
    await supabase.storage.from('profile-photos').remove([storagePath]);
    throw new Error('Uploaded photo has no image data.');
  }

  const { error: rowError } = await supabase.from('profile_photos').insert({
    user_id: user.id,
    storage_path: storagePath,
    sort_order: sortOrder,
  });

  if (rowError) {
    await supabase.storage.from('profile-photos').remove([storagePath]);
    throw rowError;
  }

  const { data } = supabase.storage.from('profile-photos').getPublicUrl(storagePath);
  return data.publicUrl;
}

function getProfilePhotoStoragePath(publicUrl: string, userId: string) {
  const marker = '/profile-photos/';
  const markerIndex = publicUrl.indexOf(marker);

  if (markerIndex === -1) {
    return null;
  }

  const storagePath = decodeURIComponent(publicUrl.slice(markerIndex + marker.length));
  return storagePath.startsWith(`${userId}/`) ? storagePath : null;
}

export async function updateCurrentUserProfilePhotoOrder(publicUrls: string[]) {
  const supabase = getSupabaseClient();
  const user = await requireSessionUser();

  const storagePaths = publicUrls
    .map((publicUrl) => getProfilePhotoStoragePath(publicUrl, user.id))
    .filter((storagePath): storagePath is string => Boolean(storagePath));

  const { error } = await supabase.rpc('reorder_profile_photos', { p_storage_paths: storagePaths });

  if (error) {
    throw error;
  }
}

export async function deleteCurrentUserProfilePhoto(publicUrl: string) {
  const supabase = getSupabaseClient();
  const user = await requireSessionUser();

  const storagePath = getProfilePhotoStoragePath(publicUrl, user.id);
  if (!storagePath) {
    return;
  }

  const { error: rowError } = await supabase
    .from('profile_photos')
    .delete()
    .eq('user_id', user.id)
    .eq('storage_path', storagePath);

  if (rowError) {
    throw rowError;
  }

  const { error: storageError } = await supabase.storage.from('profile-photos').remove([storagePath]);

  if (storageError) {
    throw storageError;
  }
}

export async function getCurrentSession() {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.getSession();

  if (error) {
    throw error;
  }

  return data.session;
}

export async function signOut() {
  const supabase = getSupabaseClient();

  try {
    await deleteCurrentUserPushTokens();
  } catch (error) {
    console.warn('Push token cleanup failed during sign out.', error);
  }

  const { error } = await supabase.auth.signOut();

  if (error) {
    throw error;
  }
}
