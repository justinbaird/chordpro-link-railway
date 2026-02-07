import React, { useState } from 'react';
import styles from './SetlistSidebar.module.css';

export interface SetlistItem {
  id: string;
  filename: string;
  title: string;
  content: string;
}

interface SetlistSidebarProps {
  items: SetlistItem[];
  currentItemId: string | null;
  onSelectItem: (item: SetlistItem) => void;
  onReorder: (items: SetlistItem[]) => void;
  onDelete: (id: string) => void;
  theme?: 'light' | 'dark';
}

export default function SetlistSidebar({
  items,
  currentItemId,
  onSelectItem,
  onReorder,
  onDelete,
  theme = 'light',
}: SetlistSidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [draggedItem, setDraggedItem] = useState<string | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedItem(items[index].id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    setDragOverIndex(null);

    if (!draggedItem) return;

    const draggedIndex = items.findIndex((item) => item.id === draggedItem);
    if (draggedIndex === -1 || draggedIndex === dropIndex) {
      setDraggedItem(null);
      return;
    }

    const newItems = [...items];
    const [removed] = newItems.splice(draggedIndex, 1);
    newItems.splice(dropIndex, 0, removed);

    onReorder(newItems);
    setDraggedItem(null);
  };

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (confirm('Remove this song from the setlist?')) {
      onDelete(id);
    }
  };

  return (
    <div className={`${styles.sidebar} ${isCollapsed ? styles.collapsed : ''} ${theme === 'dark' ? styles.dark : ''}`}>
      <div className={styles.header}>
        <h2>Setlist</h2>
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className={styles.toggleButton}
          aria-label={isCollapsed ? 'Expand' : 'Collapse'}
        >
          {isCollapsed ? '▶' : '◀'}
        </button>
      </div>
      {!isCollapsed && (
        <div className={styles.content}>
          {items.length === 0 ? (
            <div className={styles.empty}>
              <p>No songs in setlist</p>
              <p className={styles.hint}>Upload files to add songs</p>
            </div>
          ) : (
            <div className={styles.list}>
              {items.map((item, index) => (
                <div
                  key={item.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, index)}
                  className={`${styles.item} ${
                    currentItemId === item.id ? styles.active : ''
                  } ${draggedItem === item.id ? styles.dragging : ''} ${
                    dragOverIndex === index ? styles.dragOver : ''
                  }`}
                  onClick={() => onSelectItem(item)}
                >
                  <div className={styles.itemContent}>
                    <div className={styles.itemTitle}>{item.title || item.filename}</div>
                    <div className={styles.itemFilename}>{item.filename}</div>
                  </div>
                  <button
                    onClick={(e) => handleDelete(e, item.id)}
                    className={styles.deleteButton}
                    aria-label="Delete"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
