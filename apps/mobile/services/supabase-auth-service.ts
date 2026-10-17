import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { realCompatibility, realCompatibilityScore } from '@/lib/compatibility';
import { functionError } from '@/lib/service-error';
import { ageFromBirthDate } from '@/lib/age';
import { photoReference } from '@/lib/profile-photos';
import { profilePatch } from '@/lib/profile-patch';
import { cursorArgs, listPage, type ListCursor, type ListPage } from '@/lib/list-pages';
import type { MessagePage } from '@/lib/chat-cache';
import { NAME_MAX_LENGTH } from '@/lib/profile-validation';
import { confirmMessageRequest, getMessageRequestId } from '@/services/message-attempts';
import { clearLocalAuthSession, getSupabaseClient } from '@/lib/supabase';
import { finishRemoteLogout, queuePushRetirement, queueRegistrationRetirement, rememberPushRegistration, reconcilePushRetirements } from '@/services/push-registration-cleanup';
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
  /** House-by-house layout per divisional chart (D1, D9…), when the server has it. */
  chartHouses?: Record<string, ChartHouse[]>;
};

export type ChartPlanet = { name: string; abbr: string; degree?: string };
/** One house of a chart, starting from the ascendant (house 1). `sign` is 1 (Aries) to 12 (Pisces). */
export type ChartHouse = { house: number; sign: number; signName: string; planets: ChartPlanet[] };

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
  verified_email?: string | null;
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

/**
 * Row shape of the public.profile_cards view (also embedded as JSON by the RPCs). Other users'
 * cards carry an age but never contact details or birth date, time or place.
 */
type ProfileCardRow = Pick<
  ProfileRow,
  | 'id'
  | 'display_name'
  | 'gender'
  | 'gender_preferences'
  | 'height'
  | 'location'
  | 'bio'
  | 'family_plans'
  | 'family_plans_visible_on_profile'
  | 'workplace'
  | 'workplace_visible_on_profile'
  | 'job_role'
  | 'job_role_visible_on_profile'
  | 'school'
  | 'school_visible_on_profile'
  | 'education_level'
  | 'education_level_visible_on_profile'
  | 'religious_beliefs'
  | 'drinking'
  | 'drinking_visible_on_profile'
  | 'smoking'
  | 'smoking_visible_on_profile'
  | 'onboarding_completed'
  | 'created_at'
> & {
  age: number | null;
  photo_paths: string[] | null;
  compatibility_report?: CompatibilityResult | null;
};

type IncomingLikeRow = {
  id: string;
  from_user_id: string;
  opening_message: string | null;
  created_at: string;
  read_at?: string | null;
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
  chart_houses: Record<string, ChartHouse[]> | null;
  generated_at: string;
};

// Reads the persisted session; the SDK may refresh expired credentials.
// The server enforces identity through RLS on every query.
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
  client_request_id?: string | null;
  status: 'sent' | 'read';
  read_at: string | null;
  created_at: string;
};

type SentChatMessageResult = {
  clientRequestId?: string;
  id: string;
  createdAt: string;
  senderId: 'me';
  text: string;
  status?: 'sent' | 'read';
};

function maskPhone(phone: string) {
  return phone.replace(/.(?=.{4})/g, '*');
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
  return photoReference(storagePath);
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

  const bio = row.bio?.trim() || '';

  return {
    id: row.id,
    createdAt: row.created_at,
    name,
    age: row.age ?? 0,
    gender: row.gender || '',
    location: row.location?.trim() && row.location !== 'India' ? row.location : 'City not set',
    bio,
    prompt: bio,
    photos,
    details,
    compatibility: realCompatibility(row.compatibility_report),
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

  // Prefill contact information; only the database synchronizes verified email from Auth.
  // (The phone number is always taken from the verified session by the database.)
  const metadata = user.user_metadata ?? {};
  const displayName = [metadata.full_name, metadata.name].find(
    (value): value is string => typeof value === 'string' && value.trim().length > 0 && Array.from(value.trim()).length <= NAME_MAX_LENGTH
  );
  const row = {
    id: user.id,
    email: user.email || null,
    ...(displayName ? { display_name: displayName.trim() } : {}),
  };

  const insertProfile = (values: typeof row) =>
    supabase.from('profiles').upsert(values, { onConflict: 'id', ignoreDuplicates: true });

  const { error } = await insertProfile(row);

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
        'verified_email',
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
    .maybeSingle<Omit<ProfileRow, 'photo_urls'> & { profile_photos: Omit<ProfilePhotoRow, 'user_id'>[] | null }>();

  if (error) {
    throw error;
  }

  if (!data) return null;
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

export async function getOwnPublicProfile() {
  const user = await requireSessionUser();
  const { data,error } = await getSupabaseClient().from('profile_cards').select('*').eq('id',user.id).single<ProfileCardRow>();
  if (error) throw error;
  const card = data ? profileCardToDiscoverProfile(data) : null;
  if (!card) throw new Error('Could not load your profile preview.');
  return card;
}

export type SkippedCursor = { createdAt: string; id: string };
export async function getSkippedProfiles(before?: SkippedCursor) {
  const limit = 50;
  const { data, error } = await getSupabaseClient().rpc('get_skipped_profiles', {
    p_limit: limit, p_before: before?.createdAt ?? null, p_before_id: before?.id ?? null,
  });
  if (error) throw error;
  const rows = (data ?? []) as ProfileCardRow[];
  const last = rows.at(-1);
  return {
    profiles: rows.map(profileCardToDiscoverProfile).filter((profile): profile is DiscoverProfile => Boolean(profile)),
    nextCursor: rows.length === limit && last ? { createdAt: last.created_at, id: last.id } : undefined,
  };
}

export async function getPendingIncomingLikes(before?: ListCursor) {
  const { data, error } = await getSupabaseClient().rpc('get_incoming_likes_page',cursorArgs(before));

  if (error) {
    throw error;
  }

  return listPage((data ?? []) as IncomingLikeRow[],(like): LikeItem | null => {
      const fromProfile = like.profile ? profileCardToDiscoverProfile(like.profile) : null;
      if (!like.profile || !fromProfile) {
        return null;
      }

      const compatibility = realCompatibility(like.compatibility_report);

      return {
        id: like.id,
        createdAt: like.created_at,
        readAt: like.read_at ?? undefined,
        fromProfileId: like.from_user_id,
        fromProfile: { ...fromProfile, compatibility },
        fromName: fromProfile.name,
        age: fromProfile.age,
        location: fromProfile.location,
        avatarUrl: fromProfile.photos[0] ?? '',
        openingMessage: like.opening_message?.trim() || 'Sent you a like.',
        note: like.profile.bio?.trim() || '',
        timeAgo: timeAgo(like.created_at),
        compatibility,
      };
    },(like) => ({ at:like.created_at,id:like.id }));
}

function mapMessageRow(message: MessageRow, currentUserId: string): ChatMessage {
  const isMine = message.sender_id === currentUserId;

  return {
    id: message.id,
    createdAt: message.created_at,
    senderId: isMine ? 'me' : message.sender_id,
    text: message.body,
    clientRequestId: message.client_request_id ?? undefined,
    status: message.status,
    ...(isMine && message.status === 'read' && message.read_at ? { seenAt: message.read_at } : {}),
    ...(!isMine && message.read_at ? { readAt: message.read_at } : {}),
  };
}

async function getChatMessagesPage(
  chatId: string,
  currentUserId: string,
  options?: { before?: ListCursor; limit?: number }
) {
  const supabase = getSupabaseClient();
  const limit = Math.max(1, Math.min(99, Math.floor(options?.limit ?? 30)));
  const { data, error } = await supabase.rpc('get_chat_messages_page',{
    p_chat_id:chatId,...cursorArgs(options?.before),p_limit:Math.min(limit,99)+1,
  });

  if (error) {
    throw error;
  }

  const rows = (data ?? []) as MessageRow[];
  const pageRows = rows.slice(0, limit).reverse();

  return {
    messages: pageRows.map((message) => mapMessageRow(message, currentUserId)),
    hasMoreMessages: rows.length > limit,
    nextCursor:rows.length > limit && pageRows[0] ? { at:pageRows[0].created_at,id:pageRows[0].id } : undefined,
  };
}

export async function getChatMessages(
  chatId: string,
  options?: { before?: ListCursor; limit?: number }
): Promise<MessagePage> {
  const user = await getSessionUser();

  if (!user) {
    return { messages: [], hasMoreMessages: false };
  }

  return getChatMessagesPage(chatId, user.id, options);
}

export async function getChats(chatId?: string, before?: ListCursor): Promise<ListPage<ChatPreview>> {
  const user = await getSessionUser();

  if (!user) {
    return { items:[] };
  }

  let resolvedId = chatId;
  if (chatId) {
    const resolved = await getSupabaseClient().rpc('resolve_chat_id', { p_chat_id: chatId });
    if (resolved.error) throw resolved.error;
    if (resolved.data === null) return { items: [] };
    if (typeof resolved.data !== 'string') throw new Error('Chat could not be loaded.');
    resolvedId = resolved.data;
  }
  const { data, error } = await getSupabaseClient().rpc('get_chat_previews_page',{
    ...cursorArgs(before),p_chat_id:resolvedId ?? null,...(chatId ? { p_limit:1 } : {}),
  });

  if (error) {
    throw error;
  }

  return listPage((data ?? []) as ChatPreviewRow[],(chat): ChatPreview => {
    const participantProfile = chat.participant ? profileCardToDiscoverProfile(chat.participant) : null;
    const lastMessage = chat.last_message
      ? mapMessageRow({ ...chat.last_message, chat_id: chat.id }, user.id)
      : null;
    const compatibility = realCompatibility(chat.compatibility_report);

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
      compatibilityScore: realCompatibilityScore(chat.compatibility_report),
      ...(compatibility ? { compatibility } : {}),
      hasMoreMessages: false,
      messages: lastMessage ? [lastMessage] : [],
    };
  },(chat) => ({ at:chat.updated_at,id:chat.id }));
}

export async function sendMessage(chatId: string, text: string, pendingRequestId?: string, expectedUserId?: string) {
  const supabase = getSupabaseClient();
  const user = await requireSessionUser();
  if (expectedUserId && user.id !== expectedUserId) throw new Error('Your session changed. Please sign in again.');
  const attempt = { userId: user.id, kind: 'send' as const, targetId: chatId, text };
  const requestId = pendingRequestId ?? await getMessageRequestId(attempt);
  const { data, error } = await supabase.functions.invoke<{ message: SentChatMessageResult }>('send-chat-message', {
    body: {
      chatId,
      text,
      requestId,
      expectedUserId: user.id,
    },
  });

  if (error) {
    throw await functionError(error);
  }

  const message = data?.message ?? null;
  if (!message || message.clientRequestId !== requestId) {
    throw new Error('Message send did not return a message record.');
  }
  await confirmMessageRequest(attempt,requestId);

  return {
    id: message.id,
    createdAt: message.createdAt,
    senderId: 'me',
    text: message.text,
    status: message.status ?? 'sent',
    clientRequestId: requestId,
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
    email: row.email ?? '',
    verifiedEmail: row.verified_email ?? '',
    dateOfBirth: toProfileDate(row.date_of_birth) || profile.dateOfBirth,
    age: ageFromBirthDate(toProfileDate(row.date_of_birth) || profile.dateOfBirth),
    timeOfBirth: row.time_of_birth || profile.timeOfBirth,
    gender: row.gender || profile.gender,
    genderPreferences: row.gender_preferences ?? profile.genderPreferences,
    height: row.height || profile.height,
    location: row.location?.trim() && row.location !== 'India' ? row.location : '',
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

export async function updateCurrentUserProfile(
  updates: Partial<UserProfile>,
  options?: { onboardingCompleted?: boolean; expectedUserId?: string; expectedUpdatedAt?: string }
) {
  const supabase = getSupabaseClient();
  const user = await requireSessionUser();
  if (options?.expectedUserId && user.id !== options.expectedUserId) {
    throw new Error('Your session changed. Please try again.');
  }
  const { error } = await supabase.rpc('update_profile_fields', {
    p_updates: profilePatch(updates),
    p_expected_updated_at: options?.expectedUpdatedAt,
    p_complete_onboarding: options?.onboardingCompleted ?? false,
  });
  if (error) throw error;
  const row = await getCurrentUserProfile();
  if (!row || row.id !== user.id) throw new Error('Your session changed. Please reload your profile.');
  return row;
}

export async function generateCurrentUserKundli() {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.functions.invoke<{ parsed_summary: KundliSummary }>('generate-kundli');

  if (error) {
    throw await functionError(error);
  }

  if (!data?.parsed_summary) {
    throw new Error('Kundli generation did not return a summary.');
  }

  return data.parsed_summary;
}

export async function generateMatchScore(targetProfileId: string, expectedUserId?: string) {
  const supabase = getSupabaseClient();
  const user = await requireSessionUser();
  if (expectedUserId && user.id !== expectedUserId) throw new Error('Your session changed. Please sign in again.');
  const { data, error } = await supabase.functions.invoke<{ compatibility: CompatibilityResult }>(
    'generate-match-score',
    {
      body: { targetProfileId, expectedUserId: user.id },
    }
  );

  if (error) {
    throw await functionError(error);
  }

  const compatibility = realCompatibility(data?.compatibility);
  if (!compatibility) throw new Error('A compatibility report is not available. Please try again.');
  return compatibility;
}

export async function createLike(targetProfileId: string, openingMessage: string) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.functions.invoke<{ like: { id: string } }>('create-like', {
    body: { targetProfileId, openingMessage },
  });

  if (error) {
    throw await functionError(error);
  }

  if (!data?.like) {
    throw new Error('Like creation did not return a like record.');
  }

  return data.like;
}

export async function replyToLike(likeId: string, message: string, expectedUserId?: string) {
  const supabase = getSupabaseClient();
  const user = await requireSessionUser();
  if (expectedUserId && user.id !== expectedUserId) throw new Error('Your session changed. Please sign in again.');
  const attempt = { userId: user.id, kind: 'reply' as const, targetId: likeId, text: message };
  const requestId = await getMessageRequestId(attempt);
  const { data, error } = await supabase.functions.invoke<{ chatId: string; requestId: string }>('reply-to-like', {
    body: { likeId, message, requestId, expectedUserId: user.id },
  });

  if (error) {
    throw await functionError(error);
  }

  if (!data?.chatId || data.requestId !== requestId) {
    throw new Error('Reply did not return a chat.');
  }
  await confirmMessageRequest(attempt,requestId);

  return data.chatId;
}

function getExpoProjectId() {
  return Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId;
}

let pushRegistrationEpoch = 0;

export async function registerCurrentUserPushToken(
  options: { requestPermission?: boolean } = {}
): Promise<PushTokenRegistration | null> {
  const supabase = getSupabaseClient();
  const epoch = pushRegistrationEpoch;
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  const session = sessionData.session;
  if (!session) return null;
  const user = session.user;
  await reconcilePushRetirements(user.id);

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

  if (epoch !== pushRegistrationEpoch) return null;
  const registration = { userId: user.id, token, updatedAt: now };
  const { error } = await supabase.rpc('register_push_token_for_session', {
    p_token: token,
    p_platform: platform,
    p_token_type: 'expo',
    p_updated_at: now,
    p_expected_user_id: user.id,
  });

  if (error) {
    throw error;
  }

  if (epoch !== pushRegistrationEpoch) {
    await queueRegistrationRetirement(registration);
    void finishRemoteLogout(session.access_token, registration);
    return null;
  }
  await rememberPushRegistration(registration);
  return { token, platform };
}

export async function getCurrentUserKundliSummary() {
  const supabase = getSupabaseClient();
  const user = await getSessionUser();

  if (!user) {
    return null;
  }

  const { data, error } = await supabase
    .from('kundlis')
    .select('parsed_summary, raw_response, chart_image_paths, chart_houses, generated_at')
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
    chartHouses: data.chart_houses ?? {},
    chartImages: charts
      .map(([chartId, path]) => ({ chartId, path, signedUrl: signedUrlByPath.get(path) ?? '' }))
      .filter((image): image is KundliChartImage => Boolean(image.signedUrl)),
  };
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
  pushRegistrationEpoch += 1;
  const retirement = await queuePushRetirement().catch(() => null);
  const accessToken = await clearLocalAuthSession();

  await Notifications.clearLastNotificationResponseAsync().catch((error) => {
    console.warn('Notification cleanup failed during sign out.', error);
  });
  if (accessToken) void finishRemoteLogout(accessToken, retirement);
}
