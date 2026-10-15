import React from 'react';

interface ChronosLogoProps {
  size?: number;
}

export const ChronosLogo: React.FC<ChronosLogoProps> = ({ size = 40 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 40 40"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    style={{ flexShrink: 0 }}
  >
    {/* Body — white */}
    <rect x="3" y="8" width="34" height="29" rx="7" fill="white" />
    {/* Green top band */}
    <rect x="3" y="8" width="34" height="10" rx="7" fill="#22c55e" />
    <rect x="3" y="14" width="34" height="4" fill="#22c55e" />
    {/* Ring pegs */}
    <rect x="13" y="5" width="3.5" height="7" rx="1.75" fill="#16a34a" />
    <rect x="23.5" y="5" width="3.5" height="7" rx="1.75" fill="#16a34a" />
    {/* Eyes — solid dark */}
    <circle cx="15" cy="26" r="2.4" fill="#1e293b" />
    <circle cx="25" cy="26" r="2.4" fill="#1e293b" />
    {/* Smile */}
    <path d="M15.5 31.5 Q20 35 24.5 31.5" stroke="#1e293b" strokeWidth="1.6" strokeLinecap="round" fill="none" />
    {/* Rosy cheeks */}
    <circle cx="11.5" cy="29" r="2.2" fill="#f9a8d4" opacity="0.5" />
    <circle cx="28.5" cy="29" r="2.2" fill="#f9a8d4" opacity="0.5" />
  </svg>
);
