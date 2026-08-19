"use client";

import { useMemo, useRef, useState } from "react";
import type { StudentBlock } from "@/types/dataset";

// block_instance_id: a client-generated UUID assigned at add time, stable across
// move and delete events. Allows the event stream to track one physical instance
// of a block even when the same block_id appears in the workspace multiple times.
interface SelectedBlock extends StudentBlock {
  selected_key: string;
  block_instance_id: string;
}

interface BlockSqlBuilderProps {
  blocks: StudentBlock[];
  disabled?: boolean;
  onSqlChange: (sql: string, selectedBlockIds: string[]) => void;
  // block_submit (token 9) is intentionally omitted — it is reserved by the
  // Phase 5 contract and must never be emitted from this component.
  onBlockEvent?: (
    eventType: "block_add" | "block_delete" | "block_move",
    value: string,
    metadata?: Record<string, unknown>
  ) => void;
}

export default function BlockSqlBuilder({ blocks, disabled, onSqlChange, onBlockEvent }: BlockSqlBuilderProps) {
  const [selectedBlocks, setSelectedBlocks] = useState<SelectedBlock[]>([]);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const keyCounterRef = useRef(0);
  const sqlText = useMemo(() => selectedBlocks.map((b) => b.block_value).join(" "), [selectedBlocks]);

  function emitChange(nextBlocks: SelectedBlock[]) {
    onSqlChange(nextBlocks.map((b) => b.block_value).join(" "), nextBlocks.map((b) => b.block_id));
  }

  function addBlock(block: StudentBlock) {
    if (disabled) return;
    const instance: SelectedBlock = {
      ...block,
      selected_key: `${block.block_id}-${++keyCounterRef.current}`,
      // UUID generated once at add time; carried through subsequent move/delete events.
      block_instance_id: crypto.randomUUID(),
    };
    const next = [...selectedBlocks, instance];
    setSelectedBlocks(next);
    emitChange(next);
    onBlockEvent?.("block_add", block.block_code, {
      block_id: block.block_id,
      block_instance_id: instance.block_instance_id,
      next_sql: next.map((b) => b.block_value).join(" "),
    });
  }

  function deleteBlock(index: number) {
    if (disabled) return;
    const removed = selectedBlocks[index];
    const next = selectedBlocks.filter((_, i) => i !== index);
    setSelectedBlocks(next);
    emitChange(next);
    onBlockEvent?.("block_delete", removed.block_code, {
      block_id: removed.block_id,
      block_instance_id: removed.block_instance_id,
      next_sql: next.map((b) => b.block_value).join(" "),
    });
  }

  function moveBlock(fromIndex: number, toIndex: number) {
    if (disabled || toIndex < 0 || toIndex >= selectedBlocks.length) return;
    const next = [...selectedBlocks];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    setSelectedBlocks(next);
    emitChange(next);
    onBlockEvent?.("block_move", moved.block_code, {
      block_id: moved.block_id,
      block_instance_id: moved.block_instance_id,
      from_index: fromIndex,
      to_index: toIndex,
      next_sql: next.map((b) => b.block_value).join(" "),
    });
  }

  function handleDrop(targetIndex: number) {
    if (dragIndex === null) return;
    moveBlock(dragIndex, targetIndex);
    setDragIndex(null);
  }

  return (
    <section style={{ border: "1px solid #ddd", borderRadius: 8, padding: 16, marginTop: 16 }}>
      <h2>Block SQL Builder</h2>
      <p>เลือก block แล้วเรียงลำดับให้เป็นคำสั่ง SQL</p>
      <h3>Available Blocks</h3>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {blocks.map((block) => <button key={block.block_id} type="button" disabled={disabled} onClick={() => addBlock(block)}>{block.block_label}</button>)}
      </div>
      <h3>Selected Blocks</h3>
      <div style={{ display: "grid", gap: 8 }}>
        {selectedBlocks.map((block, index) => (
          <div key={block.selected_key} draggable={!disabled} onDragStart={() => setDragIndex(index)} onDragOver={(e) => e.preventDefault()} onDrop={() => handleDrop(index)} style={{ display: "flex", justifyContent: "space-between", border: "1px solid #ddd", padding: 8 }}>
            <span><strong>{index + 1}.</strong> {block.block_label}</span>
            <span>
              <button type="button" disabled={disabled || index === 0} onClick={() => moveBlock(index, index - 1)}>↑</button>
              <button type="button" disabled={disabled || index === selectedBlocks.length - 1} onClick={() => moveBlock(index, index + 1)}>↓</button>
              <button type="button" disabled={disabled} onClick={() => deleteBlock(index)}>Delete</button>
            </span>
          </div>
        ))}
      </div>
      <h3>Generated SQL</h3>
      <pre>{sqlText || "-- SQL will appear here --"}</pre>
    </section>
  );
}
