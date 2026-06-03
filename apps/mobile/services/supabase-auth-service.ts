import * as FileSystem from 'expo-file-system/legacy';

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

export type KundliChartImage = {
  chartId: string;
  path: string;
  signedUrl: string;
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

type KundliRow = {
  parsed_summary: KundliSummary;
  raw_response: Record<string, unknown>;
  chart_image_paths: Record<string, string> | null;
  generated_at: string;
};

type PendingLikeRow = {
  id: string;
  from_user_id: string;
  opening_message: string | null;
  match_score_id: string | null;
  created_at: string;
};

type LikeProfileRow = Pick<
  ProfileRow,
  | 'id'
  | 'display_name'
  | 'gender'
  | 'date_of_birth'
  | 'birth_place'
  | 'location'
  | 'bio'
  | 'created_at'
>;

type MatchScoreSummaryRow = {
  id: string;
  compatibility_report: CompatibilityResult | null;
};

type ChatRow = {
  id: string;
  like_id: string | null;
  created_at: string;
  updated_at: string;
};

type ChatParticipantRow = {
  chat_id: string;
  last_read_at: string | null;
};

type MessageRow = {
  id: string;
  chat_id: string;
  sender_id: string;
  body: string;
  status: 'sent' | 'read';
  read_at: string | null;
  created_at: string;
};

type ChatLikeRow = {
  id: string;
  from_user_id: string;
  to_user_id: string;
  match_score_id: string | null;
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

function profileRowToDiscoverProfile(row: ProfileRow, photos: string[]): DiscoverProfile | null {
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
    photos:
      photos.length > 0
        ? photos
        : ['https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=900&q=85'],
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
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    throw userError;
  }

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
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    throw userError;
  }

  if (!user) {
    return null;
  }

  await ensureCurrentUserProfile();

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
      ].join(', ')
    )
    .eq('id', user.id)
    .single<ProfileRow>();

  if (error) {
    throw error;
  }

  const { data: photoRows, error: photoError } = await supabase
    .from('profile_photos')
    .select('storage_path')
    .eq('user_id', user.id)
    .order('sort_order', { ascending: true })
    .returns<ProfilePhotoRow[]>();

  if (photoError) {
    throw photoError;
  }

  const photoUrls = (photoRows ?? []).map((photo) => {
    const { data: publicUrlData } = supabase.storage.from('profile-photos').getPublicUrl(photo.storage_path);
    return publicUrlData.publicUrl;
  });

  return {
    ...data,
    photo_urls: photoUrls,
  };
}

export async function getDiscoverProfiles() {
  const supabase = getSupabaseClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    throw userError;
  }

  if (!user) {
    return [];
  }

  const { data: profileRows, error } = await supabase
    .from('profiles')
    .select(
      [
        'id',
        'display_name',
        'gender',
        'gender_preferences',
        'height',
        'date_of_birth',
        'birth_place',
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
      ].join(', ')
    )
    .eq('onboarding_completed', true)
    .neq('id', user.id)
    .order('created_at', { ascending: false })
    .limit(50)
    .returns<ProfileRow[]>();

  if (error) {
    throw error;
  }

  const profileIds = (profileRows ?? []).map((profile) => profile.id);
  if (profileIds.length === 0) {
    return [];
  }

  const { data: photoRows, error: photoError } = await supabase
    .from('profile_photos')
    .select('user_id, storage_path, sort_order')
    .in('user_id', profileIds)
    .order('sort_order', { ascending: true })
    .returns<ProfilePhotoRow[]>();

  if (photoError) {
    throw photoError;
  }

  const photosByUserId = new Map<string, string[]>();
  for (const photo of photoRows ?? []) {
    const { data: publicUrlData } = supabase.storage.from('profile-photos').getPublicUrl(photo.storage_path);
    const photos = photosByUserId.get(photo.user_id) ?? [];
    photos.push(publicUrlData.publicUrl);
    photosByUserId.set(photo.user_id, photos);
  }

  return (profileRows ?? [])
    .map((profile) => profileRowToDiscoverProfile(profile, photosByUserId.get(profile.id) ?? []))
    .filter((profile): profile is DiscoverProfile => Boolean(profile));
}

export async function getPendingIncomingLikes() {
  const supabase = getSupabaseClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    throw userError;
  }

  if (!user) {
    return [];
  }

  const { data: likeRows, error: likeError } = await supabase
    .from('likes')
    .select('id, from_user_id, opening_message, match_score_id, created_at')
    .eq('to_user_id', user.id)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .returns<PendingLikeRow[]>();

  if (likeError) {
    throw likeError;
  }

  const likes = likeRows ?? [];
  if (likes.length === 0) {
    return [];
  }

  const fromUserIds = [...new Set(likes.map((like) => like.from_user_id))];
  const { data: profileRows, error: profileError } = await supabase
    .from('profiles')
    .select('id, display_name, gender, date_of_birth, birth_place, location, bio, created_at')
    .in('id', fromUserIds)
    .returns<LikeProfileRow[]>();

  if (profileError) {
    throw profileError;
  }

  const { data: photoRows, error: photoError } = await supabase
    .from('profile_photos')
    .select('user_id, storage_path, sort_order')
    .in('user_id', fromUserIds)
    .order('sort_order', { ascending: true })
    .returns<ProfilePhotoRow[]>();

  if (photoError) {
    throw photoError;
  }

  const matchScoreIds = [
    ...new Set(likes.map((like) => like.match_score_id).filter((id): id is string => Boolean(id))),
  ];
  const { data: matchScoreRows, error: matchScoreError } =
    matchScoreIds.length > 0
      ? await supabase
          .from('match_scores')
          .select('id, compatibility_report')
          .in('id', matchScoreIds)
          .returns<MatchScoreSummaryRow[]>()
      : { data: [] as MatchScoreSummaryRow[], error: null };

  if (matchScoreError) {
    throw matchScoreError;
  }

  const profilesById = new Map((profileRows ?? []).map((profile) => [profile.id, profile]));
  const scoresById = new Map((matchScoreRows ?? []).map((score) => [score.id, score.compatibility_report]));
  const photosByUserId = new Map<string, string[]>();

  for (const photo of photoRows ?? []) {
    const { data: publicUrlData } = supabase.storage.from('profile-photos').getPublicUrl(photo.storage_path);
    const photos = photosByUserId.get(photo.user_id) ?? [];
    photos.push(publicUrlData.publicUrl);
    photosByUserId.set(photo.user_id, photos);
  }

  return likes
    .map((like): LikeItem | null => {
      const fromProfile = profilesById.get(like.from_user_id);
      if (!fromProfile) {
        return null;
      }

      const photoUrls = photosByUserId.get(like.from_user_id) ?? [];
      const avatarUrl =
        photoUrls[0] ??
        'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=240&q=85';
      const compatibility = like.match_score_id ? scoresById.get(like.match_score_id) : null;

      return {
        id: like.id,
        createdAt: like.created_at,
        fromProfileId: like.from_user_id,
        fromName: fromProfile.display_name?.trim() || 'KundaliKonnect Member',
        age: calculateAge(fromProfile.date_of_birth),
        location: fromProfile.location || fromProfile.birth_place || 'India',
        avatarUrl,
        openingMessage: like.opening_message?.trim() || 'Sent you a like.',
        note: fromProfile.bio?.trim() || 'Interested in connecting.',
        timeAgo: timeAgo(like.created_at),
        compatibility: compatibility ?? createCompatibility(like.from_user_id),
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
  const supabase = getSupabaseClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    throw userError;
  }

  if (!user) {
    return { messages: [], hasMoreMessages: false };
  }

  return getChatMessagesPage(chatId, user.id, options);
}

export async function getChats(messageLimit = 15) {
  const supabase = getSupabaseClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    throw userError;
  }

  if (!user) {
    return [];
  }

  const { data: participantRows, error: participantError } = await supabase
    .from('chat_participants')
    .select('chat_id, last_read_at')
    .eq('user_id', user.id)
    .returns<ChatParticipantRow[]>();

  if (participantError) {
    throw participantError;
  }

  const chatIds = (participantRows ?? []).map((participant) => participant.chat_id);
  if (chatIds.length === 0) {
    return [];
  }

  const { data: chatRows, error: chatError } = await supabase
    .from('chats')
    .select('id, like_id, created_at, updated_at')
    .in('id', chatIds)
    .order('updated_at', { ascending: false })
    .returns<ChatRow[]>();

  if (chatError) {
    throw chatError;
  }

  const chats = chatRows ?? [];
  const likeIds = [...new Set(chats.map((chat) => chat.like_id).filter((id): id is string => Boolean(id)))];

  const { data: likeRows, error: likeError } =
    likeIds.length > 0
      ? await supabase
          .from('likes')
          .select('id, from_user_id, to_user_id, match_score_id')
          .in('id', likeIds)
          .returns<ChatLikeRow[]>()
      : { data: [] as ChatLikeRow[], error: null };

  if (likeError) {
    throw likeError;
  }

  const likesById = new Map((likeRows ?? []).map((like) => [like.id, like]));
  const participantIds = [
    ...new Set(
      chats
        .map((chat) => {
          const like = chat.like_id ? likesById.get(chat.like_id) : undefined;
          if (!like) {
            return null;
          }

          return like.from_user_id === user.id ? like.to_user_id : like.from_user_id;
        })
        .filter((id): id is string => Boolean(id))
    ),
  ];

  const { data: profileRows, error: profileError } =
    participantIds.length > 0
      ? await supabase
          .from('profiles')
          .select('id, display_name, gender, date_of_birth, birth_place, location, bio, created_at')
          .in('id', participantIds)
          .returns<LikeProfileRow[]>()
      : { data: [] as LikeProfileRow[], error: null };

  if (profileError) {
    throw profileError;
  }

  const { data: photoRows, error: photoError } =
    participantIds.length > 0
      ? await supabase
          .from('profile_photos')
          .select('user_id, storage_path, sort_order')
          .in('user_id', participantIds)
          .order('sort_order', { ascending: true })
          .returns<ProfilePhotoRow[]>()
      : { data: [] as ProfilePhotoRow[], error: null };

  if (photoError) {
    throw photoError;
  }

  const matchScoreIds = [
    ...new Set(
      (likeRows ?? []).map((like) => like.match_score_id).filter((id): id is string => Boolean(id))
    ),
  ];
  const { data: matchScoreRows, error: matchScoreError } =
    matchScoreIds.length > 0
      ? await supabase
          .from('match_scores')
          .select('id, compatibility_report')
          .in('id', matchScoreIds)
          .returns<MatchScoreSummaryRow[]>()
      : { data: [] as MatchScoreSummaryRow[], error: null };

  if (matchScoreError) {
    throw matchScoreError;
  }

  const profilesById = new Map((profileRows ?? []).map((profile) => [profile.id, profile]));
  const scoresById = new Map((matchScoreRows ?? []).map((score) => [score.id, score.compatibility_report]));
  const photosByUserId = new Map<string, string[]>();

  for (const photo of photoRows ?? []) {
    const { data: publicUrlData } = supabase.storage.from('profile-photos').getPublicUrl(photo.storage_path);
    const photos = photosByUserId.get(photo.user_id) ?? [];
    photos.push(publicUrlData.publicUrl);
    photosByUserId.set(photo.user_id, photos);
  }

  const previewRows = await Promise.all(
    chats.map(async (chat): Promise<ChatPreview | null> => {
      const like = chat.like_id ? likesById.get(chat.like_id) : undefined;
      if (!like) {
        return null;
      }

      const participantId = like.from_user_id === user.id ? like.to_user_id : like.from_user_id;
      const profile = profilesById.get(participantId);
      const photoUrls = photosByUserId.get(participantId) ?? [];
      const compatibility = like.match_score_id ? scoresById.get(like.match_score_id) : null;
      const [messagePage, unreadResult] = await Promise.all([
        getChatMessagesPage(chat.id, user.id, { limit: messageLimit }),
        supabase
          .from('messages')
          .select('id', { count: 'exact', head: true })
          .eq('chat_id', chat.id)
          .neq('sender_id', user.id)
          .neq('status', 'read'),
      ]);

      if (unreadResult.error) {
        throw unreadResult.error;
      }

      return {
        id: chat.id,
        createdAt: chat.created_at,
        updatedAt: chat.updated_at,
        participantId,
        name: profile?.display_name?.trim() || 'KundaliKonnect Member',
        avatarUrl:
          photoUrls[0] ??
          'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=240&q=85',
        lastMessage: messagePage.messages.at(-1)?.text ?? 'Start the conversation',
        unreadCount: unreadResult.count ?? 0,
        compatibilityScore: compatibility?.overallScore ?? createCompatibility(participantId).overallScore,
        hasMoreMessages: messagePage.hasMoreMessages,
        messages: messagePage.messages,
      };
    })
  );

  return previewRows.filter((chat): chat is ChatPreview => Boolean(chat));
}

export async function sendMessage(chatId: string, text: string) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc('send_chat_message', {
    p_chat_id: chatId,
    p_body: text,
  });

  if (error) {
    throw error;
  }

  const message = data as SentChatMessageResult | null;
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
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    throw userError;
  }

  if (!user) {
    throw new Error('No authenticated Supabase user found.');
  }

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
  const { data, error } = await supabase.functions.invoke<{ chat: ChatPreview }>('reply-to-like', {
    body: { likeId, message },
  });

  if (error) {
    throw error;
  }

  if (!data?.chat) {
    throw new Error('Reply did not return a chat record.');
  }

  return data.chat;
}

export async function getCurrentUserKundliSummary() {
  const supabase = getSupabaseClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    throw userError;
  }

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

  const chartImages = await Promise.all(
    Object.entries(data.chart_image_paths ?? {}).map(async ([chartId, path]) => {
      const { data: signedUrlData, error: signedUrlError } = await supabase.storage
        .from('kundli-charts')
        .createSignedUrl(path, 60 * 60);

      if (signedUrlError || !signedUrlData?.signedUrl) {
        return null;
      }

      return {
        chartId,
        path,
        signedUrl: signedUrlData.signedUrl,
      };
    })
  );

  return {
    ...data.parsed_summary,
    generatedAt: data.parsed_summary.generatedAt || data.generated_at,
    rawResponse: data.raw_response,
    chartImages: chartImages.filter((image): image is KundliChartImage => Boolean(image)),
  };
}

export async function uploadCurrentUserProfilePhoto(uri: string, sortOrder: number) {
  const supabase = getSupabaseClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    throw userError;
  }

  if (!user) {
    throw new Error('No authenticated Supabase user found.');
  }

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
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    throw userError;
  }

  if (!user) {
    throw new Error('No authenticated Supabase user found.');
  }

  const storagePaths = publicUrls
    .map((publicUrl) => getProfilePhotoStoragePath(publicUrl, user.id))
    .filter((storagePath): storagePath is string => Boolean(storagePath));

  for (const [index, storagePath] of storagePaths.entries()) {
    const { error } = await supabase
      .from('profile_photos')
      .update({ sort_order: index + 1000 })
      .eq('user_id', user.id)
      .eq('storage_path', storagePath);

    if (error) {
      throw error;
    }
  }

  for (const [index, storagePath] of storagePaths.entries()) {
    const { error } = await supabase
      .from('profile_photos')
      .update({ sort_order: index })
      .eq('user_id', user.id)
      .eq('storage_path', storagePath);

    if (error) {
      throw error;
    }
  }
}

export async function deleteCurrentUserProfilePhoto(publicUrl: string) {
  const supabase = getSupabaseClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    throw userError;
  }

  if (!user) {
    throw new Error('No authenticated Supabase user found.');
  }

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
  const { error } = await supabase.auth.signOut();

  if (error) {
    throw error;
  }
}
