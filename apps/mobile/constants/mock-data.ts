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

export type ActivityItem = {
  id: string;
  createdAt: string;
  type: 'match' | 'like' | 'message' | 'profile' | 'credit' | 'subscription';
  title: string;
  description: string;
  time: string;
  readAt?: string;
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
  cadence: string;
  badge?: string;
  features: string[];
  creditBonus: number;
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
  birthTimezone: '5.5',
  kundliStatus: 'pending',
};

function compatibility(id: string, score: number): CompatibilityResult {
  return {
    id: `compat-${id}`,
    generatedAt: now,
    overallScore: score,
    summary:
      'Your charts show a practical emotional rhythm, strong communication houses, and a warm long-term growth pattern.',
    yogas: ['Hamsa', 'Dhan', 'Gajkesari'],
    doshas: score > 82 ? ['Kendrum'] : ['Kendrum', 'Kaal Sarp'],
    breakdown: [
      { label: 'Guna Milan', value: Math.min(score + 8, 96) },
      { label: 'Nadi Compatibility', value: Math.max(score - 9, 62) },
      { label: 'Bhakoot/Rashi Matching', value: Math.min(score + 4, 98) },
      { label: 'Overall Match', value: score },
    ],
  };
}

export const MOCK_DISCOVER_PROFILES: DiscoverProfile[] = [
  {
    id: 'aarav',
    createdAt: '2026-05-20T10:04:00.000Z',
    name: 'Aarav',
    age: 28,
    gender: 'Male',
    location: 'Mumbai',
    bio: 'Together we could plan a mountain weekend every month.',
    prompt: 'Together we could plan a mountain weekend every month.',
    photos: [
      'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=900&q=85',
      'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=900&q=85',
      'https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=900&q=85',
    ],
    details: [
      { label: 'gender', icon: 'person-outline', text: 'Male' },
      { label: 'preference', icon: 'magnet-outline', text: 'Women' },
      { label: 'height', icon: 'resize-outline', text: '5\'11"' },
      { label: 'work', icon: 'briefcase-outline', text: 'Product Designer, Studio Nine' },
      { label: 'education', icon: 'school-outline', text: 'IIT Bombay' },
      { label: 'religion', icon: 'sparkles-outline', text: 'Spiritual' },
      { label: 'family', icon: 'people-outline', text: 'Open to children' },
    ],
    compatibility: compatibility('aarav', 88),
  },
  {
    id: 'ira',
    createdAt: '2026-05-21T14:30:00.000Z',
    name: 'Ira',
    age: 26,
    gender: 'Female',
    location: 'Bengaluru',
    bio: 'I value clear communication, slow Sundays, and lots of laughter.',
    prompt: 'I value clear communication, slow Sundays, and lots of laughter.',
    photos: [
      'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=900&q=85',
      'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=900&q=85',
      'https://images.unsplash.com/photo-1529333166437-7750a6dd5a70?auto=format&fit=crop&w=900&q=85',
    ],
    details: [
      { label: 'gender', icon: 'person-outline', text: 'Female' },
      { label: 'preference', icon: 'magnet-outline', text: 'Men' },
      { label: 'height', icon: 'resize-outline', text: '5\'6"' },
      { label: 'work', icon: 'briefcase-outline', text: 'Brand Strategist, Bloom' },
      { label: 'education', icon: 'school-outline', text: 'Christ University' },
      { label: 'religion', icon: 'sparkles-outline', text: 'Hindu' },
      { label: 'drinking', icon: 'wine-outline', text: 'Drinking: Sometimes' },
    ],
    compatibility: compatibility('ira', 86),
  },
  {
    id: 'rohan',
    createdAt: '2026-05-22T08:15:00.000Z',
    name: 'Rohan',
    age: 30,
    gender: 'Male',
    location: 'Pune',
    bio: 'Sunday mornings are for chai, books, and long walks.',
    prompt: 'Sunday mornings are for chai, books, and long walks.',
    photos: [
      'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=900&q=85',
      'https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?auto=format&fit=crop&w=900&q=85',
      'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?auto=format&fit=crop&w=900&q=85',
    ],
    details: [
      { label: 'gender', icon: 'person-outline', text: 'Male' },
      { label: 'preference', icon: 'magnet-outline', text: 'Women' },
      { label: 'height', icon: 'resize-outline', text: '5\'10"' },
      { label: 'work', icon: 'briefcase-outline', text: 'Founder, Local Table' },
      { label: 'education', icon: 'school-outline', text: 'Symbiosis' },
      { label: 'religion', icon: 'sparkles-outline', text: 'Prefer not to say' },
      { label: 'smoking', icon: 'ban-outline', text: 'Smoking: Never' },
    ],
    compatibility: compatibility('rohan', 80),
  },
];

export const MOCK_LIKES: LikeItem[] = [
  {
    id: 'like-sneha',
    createdAt: '2026-05-24T08:42:00.000Z',
    fromProfileId: 'sneha',
    fromName: 'Sneha',
    age: 27,
    location: 'Bengaluru',
    avatarUrl:
      'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=240&q=85',
    openingMessage: 'Your Ladakh photo made me pause. Was that trip as peaceful as it looks?',
    note: 'Liked your travel prompt.',
    timeAgo: '18m ago',
    compatibility: compatibility('sneha', 87),
  },
  {
    id: 'like-kabir',
    createdAt: '2026-05-24T07:00:00.000Z',
    fromProfileId: 'kabir',
    fromName: 'Kabir',
    age: 30,
    location: 'Mumbai',
    avatarUrl:
      'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=240&q=85',
    openingMessage: 'Chai, books, and long walks is a strong Sunday plan. What are you reading now?',
    note: 'Sent you a comment on your prompt.',
    timeAgo: '2h ago',
    compatibility: compatibility('kabir', 79),
  },
  {
    id: 'like-mira',
    createdAt: '2026-05-23T16:00:00.000Z',
    fromProfileId: 'mira',
    fromName: 'Mira',
    age: 26,
    location: 'Pune',
    avatarUrl:
      'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=240&q=85',
    openingMessage: 'I also believe clear communication is underrated. What does that look like for you?',
    note: 'Liked your values section.',
    timeAgo: 'Yesterday',
    compatibility: compatibility('mira', 91),
  },
];

export const MOCK_CHATS: ChatPreview[] = [
  {
    id: 'demo-thread',
    createdAt: '2026-05-24T06:20:00.000Z',
    updatedAt: '2026-05-24T07:05:00.000Z',
    participantId: 'neha',
    name: 'Neha',
    avatarUrl:
      'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=180&q=80',
    lastMessage: 'Let us pick a place halfway this weekend.',
    unreadCount: 2,
    compatibilityScore: 84,
    messages: [
      {
        id: 'neha-1',
        createdAt: '2026-05-24T06:20:00.000Z',
        senderId: 'neha',
        text: 'Your coffee walk prompt sounds like my kind of weekend.',
      },
      {
        id: 'neha-2',
        createdAt: '2026-05-24T06:44:00.000Z',
        senderId: 'me',
        text: 'Then we should pick a place halfway.',
        seenAt: '2026-05-24T06:45:00.000Z',
      },
      {
        id: 'neha-3',
        createdAt: '2026-05-24T07:05:00.000Z',
        senderId: 'neha',
        text: 'Let us pick a place halfway this weekend.',
      },
    ],
  },
  {
    id: 'chat-2',
    createdAt: '2026-05-23T11:30:00.000Z',
    updatedAt: '2026-05-23T18:02:00.000Z',
    participantId: 'arjun',
    name: 'Arjun',
    avatarUrl:
      'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=180&q=80',
    lastMessage: 'I can do Thursday evening!',
    unreadCount: 0,
    compatibilityScore: 82,
    messages: [
      {
        id: 'arjun-1',
        createdAt: '2026-05-23T11:30:00.000Z',
        senderId: 'arjun',
        text: 'There is a new chai place near Indiranagar.',
        readAt: '2026-05-23T11:35:00.000Z',
      },
      {
        id: 'arjun-2',
        createdAt: '2026-05-23T14:12:00.000Z',
        senderId: 'me',
        text: 'I have wanted to try that one.',
        seenAt: '2026-05-23T14:16:00.000Z',
      },
      {
        id: 'arjun-3',
        createdAt: '2026-05-23T18:02:00.000Z',
        senderId: 'arjun',
        text: 'I can do Thursday evening!',
        readAt: '2026-05-23T18:05:00.000Z',
      },
    ],
  },
  {
    id: 'miles',
    createdAt: '2026-05-22T17:30:00.000Z',
    updatedAt: '2026-05-22T19:12:00.000Z',
    participantId: 'miles',
    name: 'Miles',
    avatarUrl:
      'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=180&q=80',
    lastMessage: 'Ah, I have a Frenchie, too! Should we introduce them?',
    unreadCount: 0,
    hidden: true,
    compatibilityScore: 76,
    messages: [
      { id: 'm1', createdAt: '2026-05-22T17:30:00.000Z', senderId: 'miles', text: 'So, how is your weekend?' },
      {
        id: 'm2',
        createdAt: '2026-05-22T18:10:00.000Z',
        senderId: 'me',
        text: 'Slow and very needed.',
        seenAt: '2026-05-22T18:11:00.000Z',
      },
      { id: 'm3', createdAt: '2026-05-22T19:12:00.000Z', senderId: 'miles', text: 'That sounds ideal.' },
    ],
  },
];

export const MOCK_ACTIVITY: ActivityItem[] = [
  {
    id: 'activity-1',
    createdAt: '2026-05-24T07:05:00.000Z',
    type: 'match',
    title: 'You matched with Neha',
    description: 'Your Kundli compatibility is 84%.',
    time: '2h ago',
  },
  {
    id: 'activity-2',
    createdAt: '2026-05-24T04:00:00.000Z',
    type: 'like',
    title: 'Sneha liked your profile',
    description: 'She commented on your travel prompt.',
    time: '5h ago',
  },
  {
    id: 'activity-3',
    createdAt: '2026-05-23T18:02:00.000Z',
    type: 'message',
    title: 'Arjun replied to your message',
    description: 'Open Chats to continue the conversation.',
    time: 'Yesterday',
  },
];

export const MOCK_CREDIT_HISTORY: CreditHistoryItem[] = [
  {
    id: 'credit-1',
    createdAt: '2026-05-24T08:00:00.000Z',
    title: 'Daily login bonus',
    amount: 2,
    balanceAfter: 12,
  },
  {
    id: 'credit-2',
    createdAt: '2026-05-23T15:16:00.000Z',
    title: 'Compatibility report',
    amount: -1,
    balanceAfter: 10,
  },
  {
    id: 'credit-3',
    createdAt: '2026-05-22T10:30:00.000Z',
    title: 'Starter pack',
    amount: 10,
    balanceAfter: 11,
  },
];

export const MOCK_SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  {
    id: 'plus-monthly',
    name: 'Plus',
    priceLabel: '₹499',
    cadence: 'monthly',
    badge: 'Popular',
    creditBonus: 20,
    features: ['Unlimited likes', '20 credits', 'Priority likes inbox'],
  },
  {
    id: 'premium-quarterly',
    name: 'Premium',
    priceLabel: '₹1,199',
    cadence: '3 months',
    creditBonus: 75,
    features: ['All Plus features', 'Advanced compatibility reports', 'Profile boost every week'],
  },
];

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
