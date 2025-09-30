import React, { useEffect, useState, useMemo } from 'react';
import { NavLink } from 'react-router-dom';
import { AuthAPI } from './api.js';

export default function App({ children }) {
  const [me, setMe] = useState(null);
  const isRaidlead = !!me?.isRaidlead;

  useEffect(() => {
    AuthAPI.me().then((u) => setMe(u)).catch(() => setMe(null));
  }, []);

  const loginHref = useMemo(() => AuthAPI.loginUrl(), []);

  return (
    <div className="container">
      <div className="header">
        <div className="nav">
          <NavLink to="/raids" className={({isActive}) => isActive ? 'active' : ''}>Raids</NavLink>
          <NavLink to="/chars" className={({isActive}) => isActive ? 'active' : ''}>Chars</NavLink>
        </div>
        <div>
          {me ? (
            <div style={{display:'flex', gap:8, alignItems:'center'}}>
              <span className="ok">raidlead</span>
              <span className="muted">@{me.username}</span>
              <button className="btn" onClick={AuthAPI.logout}>Logout</button>
            </div>
          ) : (
            <a href={loginHref} className="btn">Login mit Discord</a>
          )}
        </div>
      </div>

      <div className="card">
        {children}
      </div>
    </div>
  );
}
  