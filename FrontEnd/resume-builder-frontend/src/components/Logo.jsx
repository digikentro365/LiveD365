import React from 'react';
import { Box } from '@mui/material';
import { useNavigate } from 'react-router-dom';

const Logo = ({ isAuth }) => {
  const navigate = useNavigate();

  const handleLogoClick = () => {
    const userRole = JSON.parse(localStorage.getItem('user'))?.role;
    if (userRole === 'admin') {
      navigate('/admin-dashboard');
    } else {
      navigate('/dashboard');
    }
  };

  if (isAuth) {
    return (
      <Box 
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          marginBottom: '16px'
        }}
      >
        <img 
          src="/lived365.png" 
          alt="LiveD365 Logo" 
          style={{ 
            height: '80px',
            width: 'auto',
            marginBottom: '8px'
          }} 
        />
        <span style={{ 
          color: '#2196F3', 
          fontSize: '24px',
          fontWeight: 400
        }}>
          LiveD365
        </span>
      </Box>
    );
  }

  return (
    <Box 
      onClick={handleLogoClick}
      sx={{ 
        cursor: 'pointer',
        padding: '8px 0',
        display: 'flex',
        alignItems: 'center',
        height: '100%'
      }}
    >
      <img 
        src="/lived365.png" 
        alt="LiveD365 Logo" 
        style={{ 
          height: '32px',
          width: 'auto',
          objectFit: 'contain'
        }} 
      />
    </Box>
  );
};

export default Logo; 