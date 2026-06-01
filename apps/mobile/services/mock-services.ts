import {
  DEFAULT_NOTIFICATIONS,
  DEFAULT_PRIVACY,
  DEFAULT_PROFILE,
  DEFAULT_SUBSCRIPTION,
  MOCK_ACTIVITY,
  MOCK_CHATS,
  MOCK_CREDIT_HISTORY,
  MOCK_DISCOVER_PROFILES,
  MOCK_LIKES,
  MOCK_SUBSCRIPTION_PLANS,
  type ActivityItem,
  type ChatMessage,
  type ChatPreview,
  type CompatibilityResult,
  type CreditHistoryItem,
  type DiscoverProfile,
  type LikeItem,
  type NotificationSettings,
  type PrivacySettings,
  type SubscriptionPlan,
  type SubscriptionState,
  type UserProfile,
} from '@/constants/mock-data';

const delay = (ms = 220) => new Promise((resolve) => setTimeout(resolve, ms));
const stamp = () => new Date().toISOString();

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function nextId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export const mockAuthService = {
  async requestOtp(phoneNumber: string) {
    await delay(180);
    return { verificationId: nextId('otp'), phoneNumber };
  },
  async verifyOtp(phoneNumber: string, otp: string) {
    await delay(240);
    return {
      sessionId: nextId('session'),
      userId: DEFAULT_PROFILE.id,
      phoneNumber,
      otpAccepted: otp.length >= 4,
    };
  },
  async signInWithGoogle() {
    await delay(260);
    return {
      sessionId: nextId('google-session'),
      userId: DEFAULT_PROFILE.id,
      email: 'demo@kundalikonnect.local',
    };
  },
  async logout() {
    await delay(120);
    return { ok: true };
  },
};

export const mockProfileService = {
  async updateProfile(profile: UserProfile, updates: Partial<UserProfile>) {
    await delay();
    return {
      ...profile,
      ...updates,
      updatedAt: stamp(),
    };
  },
};

export const mockOnboardingService = {
  async saveStep(profile: UserProfile, updates: Partial<UserProfile>) {
    return mockProfileService.updateProfile(profile, updates);
  },
  async complete(profile: UserProfile) {
    await delay();
    return {
      ...profile,
      updatedAt: stamp(),
    };
  },
};

export const mockKundliService = {
  async generateCompatibility(profile: UserProfile, candidate: DiscoverProfile | LikeItem) {
    await delay(260);
    return clone(candidate.compatibility);
  },
  async generateBirthChart(profile: UserProfile) {
    await delay(260);
    return {
      id: `chart-${profile.id}`,
      generatedAt: stamp(),
      birthDate: profile.dateOfBirth,
      birthTime: profile.timeOfBirth,
      birthPlace: profile.birthPlace || profile.location,
      ascendant: 'Taurus',
      moonSign: 'Libra',
      yogas: ['Hamsa', 'Dhan', 'Gajkesari'],
      doshas: ['Kendrum', 'Kaal Sarp'],
    };
  },
};

export const mockDiscoveryService = {
  async listProfiles() {
    await delay();
    return clone(MOCK_DISCOVER_PROFILES);
  },
  async passProfile(profileId: string) {
    await delay(140);
    return { profileId, recordedAt: stamp() };
  },
  async likeProfile(profile: DiscoverProfile, message: string) {
    await delay(240);
    return {
      id: nextId('sent-like'),
      profileId: profile.id,
      message,
      createdAt: stamp(),
    };
  },
};

export const mockLikesService = {
  async listLikes() {
    await delay();
    return clone(MOCK_LIKES);
  },
  async dismissLike(likeId: string) {
    await delay(120);
    return { likeId };
  },
  async replyToLike(like: LikeItem, message: string): Promise<ChatPreview> {
    await delay(260);
    const createdAt = stamp();
    const chatId = `chat-${like.id}`;

    return {
      id: chatId,
      createdAt,
      updatedAt: createdAt,
      participantId: like.fromProfileId,
      name: like.fromName,
      avatarUrl: like.avatarUrl,
      lastMessage: message.trim(),
      unreadCount: 0,
      compatibilityScore: like.compatibility.overallScore,
      messages: [
        {
          id: `${chatId}-intro`,
          createdAt,
          senderId: like.fromProfileId,
          text: like.openingMessage,
          readAt: createdAt,
        },
        {
          id: `${chatId}-reply`,
          createdAt,
          senderId: 'me',
          text: message.trim(),
          seenAt: createdAt,
        },
      ],
    };
  },
};

export const mockChatService = {
  async sendMessage(chat: ChatPreview, text: string): Promise<ChatMessage> {
    await delay(180);
    return {
      id: nextId(`message-${chat.id}`),
      createdAt: stamp(),
      senderId: 'me',
      text: text.trim(),
      seenAt: stamp(),
    };
  },
  async markRead(chatId: string) {
    await delay(80);
    return { chatId, readAt: stamp() };
  },
};

export const mockActivityService = {
  async listActivity(): Promise<ActivityItem[]> {
    await delay();
    return clone(MOCK_ACTIVITY);
  },
};

export const mockCreditsService = {
  async purchaseCredits(currentBalance: number, amount: number) {
    await delay(300);
    const nextBalance = currentBalance + amount;
    const item: CreditHistoryItem = {
      id: nextId('credit'),
      createdAt: stamp(),
      title: `${amount} credits purchased`,
      amount,
      balanceAfter: nextBalance,
    };
    return { balance: nextBalance, historyItem: item };
  },
  async listHistory() {
    await delay();
    return clone(MOCK_CREDIT_HISTORY);
  },
};

export const mockSubscriptionsService = {
  async listPlans(): Promise<SubscriptionPlan[]> {
    await delay();
    return clone(MOCK_SUBSCRIPTION_PLANS);
  },
  async purchasePlan(plan: SubscriptionPlan): Promise<SubscriptionState> {
    await delay(360);
    return {
      status: 'active',
      planId: plan.id,
      renewalDate: '2026-06-24',
    };
  },
  async restorePurchases(): Promise<SubscriptionState> {
    await delay(300);
    return {
      ...DEFAULT_SUBSCRIPTION,
      restoredAt: stamp(),
    };
  },
};

export const mockNotificationsService = {
  async update(settings: NotificationSettings) {
    await delay(160);
    return clone(settings);
  },
  defaults: DEFAULT_NOTIFICATIONS,
};

export const mockPrivacyService = {
  async update(settings: PrivacySettings) {
    await delay(160);
    return clone(settings);
  },
  defaults: DEFAULT_PRIVACY,
};
