export const NAME_MAX_LENGTH = 80;
export const BIO_MAX_LENGTH = 500;
export const CONTACT_EMAIL_MAX_LENGTH = 254;

export function validateProfileText(updates: { name?: string; bio?: string; email?: string }) {
  if (updates.name !== undefined && Array.from(updates.name).length > NAME_MAX_LENGTH) throw new Error(`Name must be ${NAME_MAX_LENGTH} characters or fewer.`);
  if (updates.bio !== undefined && Array.from(updates.bio).length > BIO_MAX_LENGTH) throw new Error(`Bio must be ${BIO_MAX_LENGTH} characters or fewer.`);
  if (updates.email && (Array.from(updates.email).length > CONTACT_EMAIL_MAX_LENGTH || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(updates.email))) throw new Error('Enter a valid contact email.');
}
