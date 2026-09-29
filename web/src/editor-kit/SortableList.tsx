import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ArrowDownOutlined, ArrowUpOutlined, HolderOutlined } from '@ant-design/icons';
import { Button, Space, Tooltip } from 'antd';
import type { CSSProperties, ReactNode } from 'react';

/** Mueve un elemento sin mutar el arreglo. */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return [...list];
  return arrayMove([...list], from, to);
}

interface MoveButtonsProps {
  index: number;
  count: number;
  onMove: (from: number, to: number) => void;
  disabled?: boolean;
  /** Para el aria-label: «Subir Foto 3». */
  name?: string;
}

/** Subir/Bajar: la alternativa al arrastre que funciona con teclado, lector de pantalla y en celular. */
export function MoveButtons({ index, count, onMove, disabled, name }: MoveButtonsProps) {
  const suffix = name ? ` ${name}` : '';
  return (
    <Space.Compact size="small">
      <Tooltip title="Subir">
        <Button
          size="small"
          icon={<ArrowUpOutlined />}
          aria-label={`Subir${suffix}`}
          disabled={disabled || index === 0}
          onClick={() => onMove(index, index - 1)}
        />
      </Tooltip>
      <Tooltip title="Bajar">
        <Button
          size="small"
          icon={<ArrowDownOutlined />}
          aria-label={`Bajar${suffix}`}
          disabled={disabled || index >= count - 1}
          onClick={() => onMove(index, index + 1)}
        />
      </Tooltip>
    </Space.Compact>
  );
}

export interface SortableRenderContext {
  index: number;
  /** Manija de arrastre (null si el arrastre está apagado). */
  handle: ReactNode;
  /** Botones Subir/Bajar ya conectados. */
  moveButtons: ReactNode;
}

interface SortableListProps<T> {
  items: readonly T[];
  getId: (item: T) => string;
  /** Nombre legible de cada elemento para los anuncios y aria-labels. */
  getName?: (item: T, index: number) => string;
  onReorder: (next: T[]) => void;
  renderItem: (item: T, ctx: SortableRenderContext) => ReactNode;
  /** Arrastrar y soltar (en v1 solo la galería; el resto usa Subir/Bajar). */
  draggable?: boolean;
  layout?: 'list' | 'grid';
  /** Ancho mínimo de cada celda en modo grilla. */
  gridMin?: number;
  disabled?: boolean;
}

function SortableCell({
  id,
  disabled,
  children,
}: {
  id: string;
  disabled?: boolean;
  children: (handle: ReactNode) => ReactNode;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled,
  });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    zIndex: isDragging ? 2 : undefined,
    position: 'relative',
  };
  const handle = (
    <Button
      ref={setActivatorNodeRef}
      size="small"
      type="text"
      icon={<HolderOutlined />}
      aria-label="Arrastrar para ordenar"
      style={{ cursor: disabled ? 'default' : 'grab', touchAction: 'none' }}
      disabled={disabled}
      {...attributes}
      {...listeners}
    />
  );
  return (
    <div ref={setNodeRef} style={style}>
      {children(handle)}
    </div>
  );
}

export function SortableList<T>({
  items,
  getId,
  getName,
  onReorder,
  renderItem,
  draggable = false,
  layout = 'list',
  gridMin = 180,
  disabled = false,
}: SortableListProps<T>) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const ids = items.map(getId);
  const nameOf = (id: string | number) => {
    const i = ids.indexOf(String(id));
    const item = items[i];
    return item !== undefined && getName ? getName(item, i) : `elemento ${i + 1}`;
  };
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Tomaste ${nameOf(active.id)}.`,
    onDragOver: ({ active, over }) => (over ? `${nameOf(active.id)} está sobre la posición de ${nameOf(over.id)}.` : undefined),
    onDragEnd: ({ active, over }) => (over ? `Soltaste ${nameOf(active.id)} en la posición de ${nameOf(over.id)}.` : `Soltaste ${nameOf(active.id)}.`),
    onDragCancel: ({ active }) => `Se canceló el movimiento de ${nameOf(active.id)}.`,
  };

  const move = (from: number, to: number) => {
    if (disabled) return;
    onReorder(moveItem(items, from, to));
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    move(ids.indexOf(String(active.id)), ids.indexOf(String(over.id)));
  };

  const containerStyle: CSSProperties =
    layout === 'grid'
      ? { display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${gridMin}px, 1fr))`, gap: 12 }
      : { display: 'flex', flexDirection: 'column', gap: 12 };

  const ctxFor = (item: T, index: number, handle: ReactNode): SortableRenderContext => ({
    index,
    handle,
    moveButtons: (
      <MoveButtons
        index={index}
        count={items.length}
        onMove={move}
        disabled={disabled}
        name={getName ? getName(item, index) : undefined}
      />
    ),
  });

  if (!draggable) {
    return (
      <div style={containerStyle}>
        {items.map((item, index) => (
          <div key={ids[index]}>{renderItem(item, ctxFor(item, index, null))}</div>
        ))}
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
      accessibility={{
        announcements,
        screenReaderInstructions: {
          draggable:
            'Para mover, presiona espacio o Enter. Usa las flechas para cambiar la posición y otra vez espacio o Enter para soltar. Escape cancela.',
        },
      }}
    >
      <SortableContext items={ids} strategy={layout === 'grid' ? rectSortingStrategy : verticalListSortingStrategy}>
        <div style={containerStyle}>
          {items.map((item, index) => (
            <SortableCell key={ids[index]} id={ids[index]!} disabled={disabled}>
              {(handle) => renderItem(item, ctxFor(item, index, handle))}
            </SortableCell>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
