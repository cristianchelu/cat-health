import * as React from 'react';

import './Header.css';

interface HeaderProps {}

const Header: React.FC<HeaderProps> = () => {
  return <header className="app-header"></header>;
};

export default Header;
