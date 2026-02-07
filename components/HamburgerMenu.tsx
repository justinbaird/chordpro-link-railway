import React, { useState } from 'react';
import styles from './HamburgerMenu.module.css';

interface HamburgerMenuProps {
  children: React.ReactNode;
  theme?: 'light' | 'dark';
}

export default function HamburgerMenu({ children, theme = 'light' }: HamburgerMenuProps) {
  const [isOpen, setIsOpen] = useState(false);

  const toggleMenu = () => {
    setIsOpen(!isOpen);
  };

  const closeMenu = () => {
    setIsOpen(false);
  };

  return (
    <>
      <button
        className={`${styles.hamburger} ${theme === 'dark' ? styles.dark : ''}`}
        onClick={toggleMenu}
        aria-label="Menu"
        aria-expanded={isOpen}
      >
        <span></span>
        <span></span>
        <span></span>
      </button>
      {isOpen && (
        <>
          <div className={styles.overlay} onClick={closeMenu} />
          <div className={`${styles.menu} ${isOpen ? styles.open : ''} ${theme === 'dark' ? styles.dark : ''}`}>
            <div className={styles.menuContent}>
              {children}
            </div>
          </div>
        </>
      )}
    </>
  );
}
