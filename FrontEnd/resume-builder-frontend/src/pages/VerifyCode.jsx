import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { verifyCode } from '../services/api';
import { TextField, Button, Container, Typography, Box, Paper } from '@mui/material';
import Logo from '../components/Logo';

const VerifyCode = () => {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [email, setEmail] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const storedEmail = localStorage.getItem('email');
    if (!storedEmail) navigate('/register');
    setEmail(storedEmail);
  }, [navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const { data } = await verifyCode(email, code);
      localStorage.setItem('token', data.token);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'Verification failed');
    }
  };

  return (
    <Container component="main" maxWidth="xs">
      <Box
        sx={{
          marginTop: 8,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        <Box 
          mb={1}
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 1
          }}
        >
          <img 
            src="/lived365.png" 
            alt="LiveD365 Logo" 
            style={{ 
              height: '50px',
              width: 'auto',
              marginBottom: '8px'
            }} 
          />
          <Typography
            variant="h5"
            sx={{
              color: '#2196F3',
              fontWeight: 500
            }}
          >
            LiveD365
          </Typography>
        </Box>
        <Paper elevation={3} sx={{ p: 4, width: '100%' }}>
          <Typography variant="h4" gutterBottom>Verify Your Email</Typography>
          <Typography>We've sent a verification code to {email}</Typography>
          {error && <Typography color="error">{error}</Typography>}
          <form onSubmit={handleSubmit}>
            <TextField
              label="Verification Code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              fullWidth
              margin="normal"
              required
            />
            <Button type="submit" variant="contained" fullWidth sx={{ mt: 3 }}>
              Verify
            </Button>
          </form>
        </Paper>
      </Box>
    </Container>
  );
};

export default VerifyCode;