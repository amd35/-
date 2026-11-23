/** Black vinyl disc on the stage: it spins while the room track plays and opens the music panel. */
export function RoomMusicDisc({ playing, onOpen }: { playing: boolean; onOpen: () => void }) {
  return (
    <button
      type="button"
      className={`room-vinyl${playing ? ' spinning' : ''}`}
      onClick={onOpen}
      aria-label="موسيقى الغرفة"
    >
      <span className="room-vinyl-disc">
        <span className="room-vinyl-label">♪</span>
        <span className="room-vinyl-hole" />
      </span>
    </button>
  );
}
