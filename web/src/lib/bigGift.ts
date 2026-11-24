/** «هدية المليون»: one diamond gift worth a million or more, announced everywhere. */
export interface BigGiftEvent {
  id: string;
  roomId: string;
  roomName: string;
  senderName: string;
  recipientName: string;
  giftName: string;
  quantity: number;
  coins: number;
  gift?: {
    name: string;
    design?: string | null;
    videoUrl?: string | null;
    coverUrl?: string | null;
    rarity?: string | null;
  } | null;
  /** The crowd bots that walked into the room on their own. */
  entrants?: { id: string; name: string; avatarUrl: string | null }[];
}
