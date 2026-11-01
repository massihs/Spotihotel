"use client";

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useId, useState, useTransition, type HTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export type HandleProps = HTMLAttributes<HTMLButtonElement> & { "aria-label": string };

/**
 * Vertical drag-and-drop list (mouse, touch and keyboard: Space to lift, arrows to move).
 * The new order is applied optimistically and rolled back if `onReorder` fails.
 */
export function SortableList<T>({
  items,
  getId,
  onReorder,
  renderItem,
  handleLabel,
  className,
  disabled,
}: {
  items: T[];
  getId: (item: T) => string;
  onReorder: (ids: string[]) => Promise<boolean>;
  renderItem: (item: T, handle: ReactNode) => ReactNode;
  handleLabel: (item: T) => string;
  className?: string;
  disabled?: boolean;
}) {
  const [order, setOrder] = useState(() => items.map(getId));
  const [, startTransition] = useTransition();
  const dndId = useId();
  const itemsKey = items.map(getId).join(",");
  const [lastKey, setLastKey] = useState(itemsKey);
  if (itemsKey !== lastKey) {
    // Server data changed (refresh): adopt it.
    setLastKey(itemsKey);
    setOrder(items.map(getId));
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const byId = new Map(items.map((i) => [getId(i), i]));
  const ordered = order.map((id) => byId.get(id)).filter((x): x is T => x !== undefined);

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const previous = order;
    const next = arrayMove(order, order.indexOf(String(active.id)), order.indexOf(String(over.id)));
    setOrder(next);
    startTransition(async () => {
      const ok = await onReorder(next);
      if (!ok) setOrder(previous);
    });
  }

  return (
    <DndContext id={dndId} sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={order} strategy={verticalListSortingStrategy} disabled={disabled}>
        <ul className={className}>
          {ordered.map((item) => (
            <SortableRow key={getId(item)} id={getId(item)} label={handleLabel(item)} disabled={disabled}>
              {(handle) => renderItem(item, handle)}
            </SortableRow>
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

function SortableRow({
  id,
  label,
  disabled,
  children,
}: {
  id: string;
  label: string;
  disabled?: boolean;
  children: (handle: ReactNode) => ReactNode;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id, disabled });

  const handle = disabled ? null : (
    <button
      type="button"
      ref={setActivatorNodeRef}
      {...attributes}
      {...listeners}
      aria-label={label}
      className="grid size-8 shrink-0 cursor-grab touch-none place-items-center rounded-lg text-fg-subtle hover:bg-surface-2 hover:text-fg active:cursor-grabbing"
    >
      <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden="true">
        <circle cx="9" cy="6" r="1.6" />
        <circle cx="15" cy="6" r="1.6" />
        <circle cx="9" cy="12" r="1.6" />
        <circle cx="15" cy="12" r="1.6" />
        <circle cx="9" cy="18" r="1.6" />
        <circle cx="15" cy="18" r="1.6" />
      </svg>
    </button>
  );

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("relative", isDragging && "z-10 opacity-90 shadow-xl")}
    >
      {children(handle)}
    </li>
  );
}
