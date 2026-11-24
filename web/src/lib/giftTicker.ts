/** One gift sent in a room, shown by the announcement bar. */
export interface GiftTickerItem {
  id: string;
  roomId: string;
  roomName: string;
  senderName: string;
  senderAvatar?: string | null;
  recipientName: string;
  recipientAvatar?: string | null;
  giftName: string;
  quantity: number;
  coins?: number;
  /** The gift's own artwork: a video, a photo, or a drawn scene. */
  gift?: {
    name: string;
    design?: string | null;
    videoUrl?: string | null;
    coverUrl?: string | null;
    rarity?: string | null;
  } | null;
}
