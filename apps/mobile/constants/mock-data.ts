import { type ComponentProps } from 'react';

import Ionicons from '@expo/vector-icons/Ionicons';

export type UserProfile = {
  id: string;
  createdAt: string;
  updatedAt: string;
  name: string;
  email: string;
  dateOfBirth: string;
  timeOfBirth: string;
  age: number;
  gender: string;
  genderPreferences: string[];
  height: string;
  familyPlans: string;
  familyPlansVisibleOnProfile: boolean;
  workplace: string;
  workplaceVisibleOnProfile: boolean;
  jobRole: string;
  jobRoleVisibleOnProfile: boolean;
  school: string;
  schoolVisibleOnProfile: boolean;
  educationLevel: string;
  educationLevelVisibleOnProfile: boolean;
  religiousBeliefs: string;
  drinking: string;
  drinkingVisibleOnProfile: boolean;
  smoking: string;
  smokingVisibleOnProfile: boolean;
  location: string;
  bio: string;
  phoneNumber: string;
  photoUris: string[];
  birthPlace: string;
  birthLatitude: string;
  birthLongitude: string;
  birthTimezone: string;
  kundliStatus: 'pending' | 'generated' | 'failed';
};

export type CompatibilityBreakdown = {
  label: string;
  value: number;
};

export type CompatibilityResult = {
  id: string;
  generatedAt: string;
  overallScore: number;
  summary: string;
  yogas: string[];
  doshas: string[];
  breakdown: CompatibilityBreakdown[];
  raw?: Record<string, unknown>;
};

export type ProfileDetail = {
  label: string;
  icon: ComponentProps<typeof Ionicons>['name'];
  text: string;
};

export type DiscoverProfile = {
  id: string;
  createdAt: string;
  name: string;
  age: number;
  gender: string;
  location: string;
  bio: string;
  prompt: string;
  photos: string[];
  details: ProfileDetail[];
  compatibility: CompatibilityResult;
};

export type LikeItem = {
  id: string;
  createdAt: string;
  fromProfileId: string;
  fromProfile?: DiscoverProfile;
  fromName: string;
  age: number;
  location: string;
  avatarUrl: string;
  openingMessage: string;
  note: string;
  timeAgo: string;
  readAt?: string;
  compatibility: CompatibilityResult;
};

export type ChatMessage = {
  id: string;
  createdAt: string;
  senderId: 'me' | string;
  text: string;
  status?: 'sent' | 'read';
  readAt?: string;
  seenAt?: string;
};

export type ChatPreview = {
  id: string;
  createdAt: string;
  updatedAt: string;
  participantId: string;
  participantProfile?: DiscoverProfile;
  name: string;
  avatarUrl: string;
  lastMessage: string;
  unreadCount: number;
  hidden?: boolean;
  compatibilityScore: number;
  compatibility?: CompatibilityResult;
  hasMoreMessages?: boolean;
  messages: ChatMessage[];
};

export type CreditHistoryItem = {
  id: string;
  createdAt: string;
  title: string;
  amount: number;
  balanceAfter: number;
};

export type SubscriptionPlan = {
  id: string;
  name: string;
  priceLabel: string;
  /** Price in minor units (paise) when the plan can be bought in-app. */
  priceMinor?: number;
  currency: string;
  cadence: string;
  badge?: string;
  features: string[];
  creditBonus: number;
};

export type CreditPack = {
  id: string;
  name: string;
  credits: number;
  priceMinor: number;
  currency: string;
};

export type SubscriptionState = {
  status: 'free' | 'active' | 'expired';
  planId?: string;
  renewalDate?: string;
  restoredAt?: string;
};

export type NotificationSettings = {
  likes: boolean;
  matches: boolean;
  messages: boolean;
  astrologyReports: boolean;
};

export type PrivacySettings = {
  showDistance: boolean;
  showOnlineStatus: boolean;
  profileDiscoverable: boolean;
};

const now = '2026-05-24T09:00:00.000Z';

export const DEFAULT_PROFILE: UserProfile = {
  id: 'local-user',
  createdAt: now,
  updatedAt: now,
  name: 'New User',
  email: '',
  dateOfBirth: '',
  timeOfBirth: '',
  age: 25,
  gender: '',
  genderPreferences: [],
  height: '',
  familyPlans: '',
  familyPlansVisibleOnProfile: true,
  workplace: '',
  workplaceVisibleOnProfile: true,
  jobRole: '',
  jobRoleVisibleOnProfile: true,
  school: '',
  schoolVisibleOnProfile: true,
  educationLevel: '',
  educationLevelVisibleOnProfile: true,
  religiousBeliefs: '',
  drinking: '',
  drinkingVisibleOnProfile: true,
  smoking: '',
  smokingVisibleOnProfile: true,
  location: 'India',
  bio: '',
  phoneNumber: '',
  photoUris: [],
  birthPlace: '',
  birthLatitude: '',
  birthLongitude: '',
  birthTimezone: '',
  kundliStatus: 'pending',
};

export const DEFAULT_SUBSCRIPTION: SubscriptionState = {
  status: 'free',
};

export const DEFAULT_NOTIFICATIONS: NotificationSettings = {
  likes: true,
  matches: true,
  messages: true,
  astrologyReports: false,
};

export const DEFAULT_PRIVACY: PrivacySettings = {
  showDistance: true,
  showOnlineStatus: true,
  profileDiscoverable: true,
};
