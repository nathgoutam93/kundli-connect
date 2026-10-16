/**
 * Built-in copies of the privacy policy and terms, shown when no hosted page is configured
 * (EXPO_PUBLIC_PRIVACY_POLICY_URL / EXPO_PUBLIC_TERMS_URL).
 *
 * DRAFT: written to match what the app and backend actually do, but it is not legal advice. Have
 * it reviewed by a lawyer, fill in LEGAL_CONTACT, and keep it in sync with the hosted pages.
 */

export type LegalDocumentId = 'privacy' | 'terms';

/** A paragraph, or a bulleted list. */
export type LegalBlock = string | string[];

export type LegalSection = {
  heading: string;
  body: LegalBlock[];
};

export type LegalDocument = {
  title: string;
  lastUpdated: string;
  intro: string;
  sections: LegalSection[];
};

// TODO before launch: replace every bracketed value.
export const LEGAL_CONTACT = {
  company: '[Company legal name]',
  address: '[Registered address, India]',
  supportEmail: '[support@your-domain]',
  grievanceOfficer: '[Grievance Officer name]',
  grievanceEmail: '[grievance@your-domain]',
};

const APP = 'Kundali Konnect';
const C = LEGAL_CONTACT;

const PRIVACY_POLICY: LegalDocument = {
  title: 'Privacy Policy',
  lastUpdated: '[Date]',
  intro: `${APP} is a dating app that suggests matches using Vedic astrology. This policy explains what personal data we collect, why, who we share it with, how long we keep it, and the choices you have. ${APP} is operated by ${C.company} (“we”, “us”). We act as the Data Fiduciary for your data under India’s Digital Personal Data Protection Act, 2023.`,
  sections: [
    {
      heading: 'What we collect',
      body: [
        'Information you give us:',
        [
          'Your phone number (to sign in with a one-time code), or your name and email address if you sign in with Google, Facebook or Apple.',
          'Profile details: name, gender, who you’d like to meet, height, city, bio, photos, and anything optional you add such as work, education, family plans, religious beliefs, drinking and smoking.',
          'Birth details: date, time and place of birth, including the place’s coordinates and time zone. These are used to generate your Kundli.',
          'What you do in the app: likes, passes, messages, matches, reports and blocks.',
          'Purchases: which credits or plans you bought and their status. Card and UPI details are handled by our payment provider and never reach us.',
        ],
        'Information collected automatically:',
        [
          'A push notification token for your device, if you allow notifications.',
          'Your device’s approximate location, only if you allow it, and only to centre the map when you choose your birthplace. We don’t store it or track your location.',
          'Technical logs (such as IP address, device type and error details) kept by our hosting providers to run and secure the service.',
        ],
      ],
    },
    {
      heading: 'How we use it',
      body: [
        [
          'To create your account and keep you signed in.',
          'To generate your Kundli and calculate compatibility with other members.',
          'To show your profile to other members and show you suggested matches.',
          'To deliver likes, messages and notifications.',
          'To process purchases and keep records we’re required to keep.',
          'To keep the community safe: reviewing reports, preventing fraud and abuse, and enforcing our Terms.',
          'To fix problems and improve the app.',
        ],
        'We don’t sell your personal data, and we don’t use it for third-party advertising.',
      ],
    },
    {
      heading: 'What other members can see',
      body: [
        'Other members can see your name, age (not your date of birth), photos, bio, city, Kundli summary and your compatibility with them, and the optional details you choose to show. Your phone number, email address, exact birth details and birthplace coordinates are never shown to other members. You can hide your profile from Discover at any time in Settings.',
      ],
    },
    {
      heading: 'Who we share it with',
      body: [
        'We share data only with service providers who help us run the app, and only what each one needs:',
        [
          'Supabase: hosting for our database, file storage, sign-in and server functions.',
          'AstrologyAPI: your birth date, time, coordinates and time zone (without your name or contact details) to calculate your chart.',
          'SMS providers: your phone number, to send sign-in codes.',
          'Google, Facebook or Apple: only if you choose to sign in with them.',
          'Expo, Google (Firebase) and Apple: to deliver push notifications.',
          'Photon (OpenStreetMap): the text you type when searching for your birthplace.',
          'Google Maps: to display the map when you choose your birthplace.',
          '[Razorpay]: to process payments.',
        ],
        'We may also disclose data when the law requires it, to respond to valid legal requests, or to protect the safety of our members or the public.',
        'Some of these providers may process data outside India. Where they do, we rely on their contractual commitments to protect it.',
      ],
    },
    {
      heading: 'How long we keep it',
      body: [
        'We keep your data while your account is open. When you delete your account, we delete your profile, photos, birth details, Kundli, likes, matches and messages straight away, and conversations end for the other person too.',
        'We keep reports about safety concerns, without your profile details, for as long as needed to protect the community, and records of payments for as long as tax and accounting laws require. Backups are overwritten within [30] days.',
      ],
    },
    {
      heading: 'Your rights and choices',
      body: [
        [
          'See and correct your profile in Edit profile. Birth details are locked after onboarding so compatibility scores stay trustworthy; contact us if they need correcting.',
          'Hide your profile from Discover, or turn notifications off, in Settings.',
          'Delete your account and data any time in Settings → Delete account, or by emailing us.',
          `Ask us for a summary of the data we hold about you, or raise a concern, by emailing ${C.supportEmail}.`,
          'Nominate someone to exercise your rights if you die or become unable to.',
        ],
        'You can withdraw consent at any time by deleting your account. This doesn’t affect anything we did lawfully before you withdrew it.',
      ],
    },
    {
      heading: 'Security',
      body: [
        'Data is encrypted in transit, access to your data is restricted to your own account by database rules, and only a small number of authorised people can access it for support and safety. No system is perfectly secure; if a breach affects you, we’ll tell you and the Data Protection Board as the law requires.',
      ],
    },
    {
      heading: 'Adults only',
      body: [
        `${APP} is only for people aged 18 or over. We don’t knowingly collect data from anyone younger, and we delete accounts we find belong to someone under 18. If you believe a member is under 18, please report their profile.`,
      ],
    },
    {
      heading: 'Changes to this policy',
      body: [
        'If we make significant changes, we’ll tell you in the app before they take effect. The date at the top shows when this policy last changed.',
      ],
    },
    {
      heading: 'Contact and grievances',
      body: [
        `Questions or requests: ${C.supportEmail}.`,
        `Grievance Officer: ${C.grievanceOfficer}, ${C.grievanceEmail}, ${C.company}, ${C.address}. We aim to respond within [7] days and resolve grievances within the time the law requires. If you’re not satisfied, you can complain to the Data Protection Board of India.`,
      ],
    },
  ],
};

const TERMS_OF_SERVICE: LegalDocument = {
  title: 'Terms of Service',
  lastUpdated: '[Date]',
  intro: `These terms are an agreement between you and ${C.company} for your use of ${APP}. By creating an account you agree to them and to our Privacy Policy. If you don’t agree, please don’t use the app.`,
  sections: [
    {
      heading: 'Who can use Kundali Konnect',
      body: [
        [
          'You must be at least 18 years old.',
          'You must be legally able to enter into this agreement and not be barred from using the service under any law.',
          'You must not have been convicted of a sexual or violent offence, and must not have been removed from the app before.',
          'One account per person, in your own name, with accurate information, including your real birth details.',
        ],
      ],
    },
    {
      heading: 'Your account',
      body: [
        'Keep your sign-in secure; you’re responsible for activity on your account. Tell us straight away if you think someone else has accessed it. You can delete your account at any time in Settings.',
      ],
    },
    {
      heading: 'How you must behave',
      body: [
        'Treat other members with respect. You must not:',
        [
          'Harass, threaten, stalk, bully or intimidate anyone.',
          'Post nudity, sexual content, violence, hate speech or anything illegal.',
          'Impersonate anyone, use someone else’s photos, or misrepresent your identity, age or intentions.',
          'Ask other members for money, promote products or services, or run scams.',
          'Share another member’s personal information or messages without their permission.',
          'Use bots, scrape the app, or try to get around its security or limits.',
        ],
        'We can remove content, limit features, or suspend or delete accounts that break these rules, with or without notice. Use Report on any profile or chat to tell us about a problem; we review reports as quickly as we can.',
      ],
    },
    {
      heading: 'Meeting people safely',
      body: [
        'We don’t run criminal background checks or verify the identity of every member, and we aren’t responsible for how members behave on or off the app. Take care when talking to people you don’t know: meet in public, tell a friend, and never send money. Contact local authorities if you’re in danger.',
      ],
    },
    {
      heading: 'Astrology and compatibility',
      body: [
        'Kundli charts and compatibility scores are calculated using traditional Vedic astrology methods and are provided for interest and guidance only. They are not scientific predictions and shouldn’t be the only basis for important decisions about your life or relationships.',
      ],
    },
    {
      heading: 'Your content',
      body: [
        'You own the photos, text and messages you post. You give us a non-exclusive, royalty-free licence to host, display and process them to run the app (for example, showing your profile to other members). The licence ends when you delete the content or your account, except where we must keep something for safety or legal reasons. You confirm you have the right to post everything you upload.',
      ],
    },
    {
      heading: 'Credits and subscriptions',
      body: [
        'Some features use credits or need a paid plan. Prices are shown before you buy and include applicable taxes. Credits have no cash value, can’t be transferred, and aren’t refundable except where the law requires. Plans renew only as described at purchase. Deleting your account forfeits remaining credits and plan time. [Describe auto-renewal and cancellation once billing is final.]',
      ],
    },
    {
      heading: 'The service',
      body: [
        'We work to keep the app available and accurate but provide it “as is”. We may change, pause or stop features. To the extent the law allows, we aren’t liable for indirect or consequential losses, or for the conduct of other members, and our total liability to you is limited to the amount you paid us in the 12 months before the claim.',
      ],
    },
    {
      heading: 'Ending your use',
      body: [
        'You can stop using the app and delete your account at any time. We can suspend or end your access if you break these terms or to protect other members. Sections that by their nature should continue (such as content licences needed for safety records, and limits of liability) survive.',
      ],
    },
    {
      heading: 'Changes to these terms',
      body: [
        'We may update these terms. If changes are significant we’ll tell you in the app before they take effect; continuing to use the app after that means you accept them.',
      ],
    },
    {
      heading: 'Law and disputes',
      body: [
        `These terms are governed by the laws of India. Disputes are subject to the courts of [City], India. Please contact us first at ${C.supportEmail} so we can try to resolve things informally.`,
      ],
    },
    {
      heading: 'Contact',
      body: [`${C.company}, ${C.address}. Email: ${C.supportEmail}.`],
    },
  ],
};

export const LEGAL_DOCUMENTS: Record<LegalDocumentId, LegalDocument> = {
  privacy: PRIVACY_POLICY,
  terms: TERMS_OF_SERVICE,
};

export function isLegalDocumentId(value: unknown): value is LegalDocumentId {
  return value === 'privacy' || value === 'terms';
}
