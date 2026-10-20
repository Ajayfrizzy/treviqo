// Existing upload/removal grace period. S3 PUT has a separate 30-second bound.
// A crashed upload keeps its durable key until this reservation expires.
export const UPLOAD_RESERVATION_MS = 15 * 60 * 1000;
