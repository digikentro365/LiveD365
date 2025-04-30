import { useState, useEffect } from 'react';
import { 
  TextField, 
  Button, 
  Container, 
  Typography, 
  Box, 
  Paper, 
  Table, 
  TableBody, 
  TableCell, 
  TableContainer, 
  TableHead, 
  TableRow,
  Chip,
  Stack,
  LinearProgress,
  Tooltip
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import { searchCandidates } from '../services/api';

const AdminSearch = () => {
  const [keyword, setKeyword] = useState('');
  const [keywords, setKeywords] = useState([]);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [totalResults, setTotalResults] = useState(0);

  const handleAddKeyword = (event) => {
    if (event.key === 'Enter' && keyword.trim()) {
      if (!keywords.includes(keyword.trim())) {
        setKeywords([...keywords, keyword.trim()]);
      }
      setKeyword('');
    }
  };

  const handleDeleteKeyword = (keywordToDelete) => {
    setKeywords(keywords.filter((k) => k !== keywordToDelete));
  };

  const handleSearch = async () => {
    if (keywords.length === 0 && !keyword.trim()) {
      setError('Please enter at least one search term');
      return;
    }

    const searchTerms = [...keywords];
    if (keyword.trim()) {
      searchTerms.push(keyword.trim());
    }

    setLoading(true);
    setError('');
    
    try {
      const { data } = await searchCandidates(searchTerms);
      setResults(data.results);
      setTotalResults(data.totalResults);
    } catch (err) {
      setError(err.response?.data?.message || 'Search failed');
      console.error('Search error:', err);
    } finally {
      setLoading(false);
    }
  };

  const getRelevanceColor = (score) => {
    if (score >= 0.7) return 'success.main';
    if (score >= 0.4) return 'warning.main';
    return 'error.main';
  };

  return (
    <Container maxWidth="lg" sx={{ mt: 4 }}>
      <Typography variant="h4" gutterBottom>Advanced Candidate Search</Typography>
      
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mb: 4 }}>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <TextField
            fullWidth
            variant="outlined"
            label="Add search keywords (press Enter to add)"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyPress={handleAddKeyword}
          />
          <Button
            variant="contained"
            onClick={handleSearch}
            disabled={loading || (keywords.length === 0 && !keyword.trim())}
            startIcon={<SearchIcon />}
            sx={{ minWidth: 120 }}
          >
            {loading ? 'Searching...' : 'Search'}
          </Button>
        </Box>

        {keywords.length > 0 && (
          <Stack direction="row" spacing={1} flexWrap="wrap">
            {keywords.map((kw) => (
              <Chip
                key={kw}
                label={kw}
                onDelete={() => handleDeleteKeyword(kw)}
                color="primary"
                sx={{ m: 0.5 }}
              />
            ))}
          </Stack>
        )}
      </Box>

      {error && (
        <Typography color="error" sx={{ mb: 2 }}>
          {error}
        </Typography>
      )}

      {loading && <LinearProgress sx={{ mb: 2 }} />}

      {results.length > 0 && (
        <>
          <Typography variant="subtitle1" gutterBottom>
            Found {totalResults} matching candidates
          </Typography>
          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Relevance</TableCell>
                  <TableCell>Name</TableCell>
                  <TableCell>Skills</TableCell>
                  <TableCell>Description</TableCell>
                  <TableCell>Work Experience</TableCell>
                  <TableCell>Education</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {results.map((user, index) => (
                  <TableRow key={index}>
                    <TableCell>
                      <Tooltip title={`Match Score: ${Math.round(user.relevanceScore * 100)}%`}>
                        <Box sx={{ width: '100%' }}>
                          <LinearProgress
                            variant="determinate"
                            value={user.relevanceScore * 100}
                            sx={{
                              height: 10,
                              borderRadius: 5,
                              backgroundColor: 'grey.300',
                              '& .MuiLinearProgress-bar': {
                                backgroundColor: getRelevanceColor(user.relevanceScore),
                              },
                            }}
                          />
                        </Box>
                      </Tooltip>
                    </TableCell>
                    <TableCell>
                      {user.personalInformation?.firstName || 'N/A'}
                    </TableCell>
                    <TableCell>
                      <Stack direction="row" spacing={1} flexWrap="wrap">
                        {user.skills?.map((skill, i) => (
                          <Chip key={i} label={skill} size="small" sx={{ m: 0.5 }} />
                        ))}
                      </Stack>
                    </TableCell>
                    <TableCell>
                      {user.about?.description}
                    </TableCell>
                    <TableCell>
                      {user.workExperience?.map((exp, i) => (
                        <Box key={i} sx={{ mb: 1 }}>
                          <Typography variant="subtitle2">{exp.jobTitle}</Typography>
                          <Typography variant="body2">{exp.companyName}</Typography>
                          <Typography variant="caption">
                            {exp.startDate} - {exp.endDate || 'Present'}
                          </Typography>
                        </Box>
                      ))}
                    </TableCell>
                    <TableCell>
                      {user.Qualification?.map((edu, i) => (
                        <Box key={i} sx={{ mb: 1 }}>
                          <Typography variant="subtitle2">{edu.Degree}</Typography>
                          <Typography variant="body2">{edu.Institution}</Typography>
                          <Typography variant="caption">
                            {edu.Start_month_year} - {edu.End_month_year}
                          </Typography>
                        </Box>
                      ))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </>
      )}

      {!loading && results.length === 0 && (
        <Typography variant="body1" sx={{ mt: 2 }}>
          No results found. Try different search terms.
        </Typography>
      )}
    </Container>
  );
};

export default AdminSearch;