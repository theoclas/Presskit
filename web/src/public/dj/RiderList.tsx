interface Props {
  items: { name: string; note: string | null }[];
}

/** Mismo marcado que la plantilla: un .media-grid por equipo, con el nombre en <b>. */
export function RiderList({ items }: Props) {
  return (
    <div role="list">
      {items.map((item, i) => (
        <div className="media-grid" role="listitem" key={`${item.name}-${i}`}>
          <figure className="media-item2">
            <b>{item.name}</b>
            {item.note ? <span className="rider-note">{item.note}</span> : null}
          </figure>
        </div>
      ))}
    </div>
  );
}
