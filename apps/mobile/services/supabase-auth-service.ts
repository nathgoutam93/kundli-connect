import * as FileSystem from 'expo-file-system/legacy';

import { getSupabaseClient } from '@/lib/supabase';
import type { UserProfile } from '@/constants/mock-data';

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
  storage_path: string;
};

type KundliRow = {
  parsed_summary: KundliSummary;
  raw_response: Record<string, unknown>;
  chart_image_paths: Record<string, string> | null;
  generated_at: string;
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
