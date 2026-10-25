/**
 * Photographic icons used across the web UI instead of emoji.
 *
 * Every file lives in `web/public/img/icons` (real photos from Wikimedia Commons
 * with a free licence — see `img/icons/CREDITS.md`) and is served at
 * `/img/icons/<file>`. `name` is the UI key below, `size` the rendered px box.
 */
const ICONS = {
  coin: 'coin.jpg',
  gold: 'gold.jpg',
  gem: 'gem.jpg',
  trophy: 'trophy.png',
  crown: 'crown.jpg',
  friends: 'friends.jpg',
  mic: 'mic.jpg',
  gift: 'gift.jpg',
  party: 'party.jpg',
  megaphone: 'megaphone.jpg',
  wallet: 'wallet.jpg',
  cart: 'cart.jpg',
  bag: 'bag.jpg',
  bell: 'bell.jpg',
  house: 'house.jpg',
  dice: 'dice.jpg',
  domino: 'domino.jpg',
  lock: 'lock.jpg',
  hand: 'hand.jpg',
  dotOn: 'dotOn.jpg',
  dotOff: 'dotOff.jpg',
  palette: 'palette.jpg',
  rose: 'rose.jpg',
  heart: 'heart.jpg',
  coffee: 'coffee.jpg',
  cake: 'cake.jpg',
  teddy: 'teddy.jpg',
  car: 'car.jpg',
  rocket: 'rocket.jpg',
  castle: 'castle.jpg',
  yacht: 'yacht.jpg',
  jet: 'jet.jpg',
  star: 'star.jpg',
}

/** Gift emojis stored on the server, mapped to the matching photo (VS16 stripped). */
const GIFT_ICONS = {
  '\u{1F339}': 'rose',
  '\u2764': 'heart',
  '\u2615': 'coffee',
  '\u{1F370}': 'cake',
  '\u{1F9F8}': 'teddy',
  '\u{1F697}': 'car',
  '\u{1F451}': 'crown',
  '\u{1F680}': 'rocket',
  '\u{1F3F0}': 'castle',
  '\u{1F6E5}': 'yacht',
  '\u2708': 'jet',
  '\u{1F31F}': 'star',
  '\u{1F381}': 'gift',
}

export function giftIconName(emoji = '') {
  return GIFT_ICONS[emoji.replace(/\uFE0F/g, '')] || 'gift'
}

export default function PhotoIcon({ name, size = 18, alt = '', className = '' }) {
  const file = ICONS[name]
  if (!file) return null
  return (
    <img
      className={`photo-icon${className ? ` ${className}` : ''}`}
      src={`/img/icons/${file}`}
      alt={alt}
      width={size}
      height={size}
      style={{ width: size, height: size }}
      loading="lazy"
      decoding="async"
    />
  )
}
