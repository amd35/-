/** One gift sent in a room, shown by the announcement bar. */
export interface GiftTickerItem {
  id: string;
  roomId: string;
  roomName: string;
  senderName: string;
  recipientName: string;
  giftName: string;
  quantity: number;
}
