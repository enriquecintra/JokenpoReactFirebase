import { Outlet, Link } from 'react-router-dom'
import { AppBar, Box, Container, Toolbar, Typography } from '@mui/material'


export default function App() {
    return (
        <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
            <AppBar position="static" color="primary">
                <Toolbar>
                    <Typography variant="h6" component={Link} to="/" sx={{ color: '#fff', textDecoration: 'none' }}>
                        Jokenpo Online
                    </Typography>
                </Toolbar>
            </AppBar>


            <Container sx={{ py: 4, flex: 1 }}>
                <Outlet />
            </Container>


            <Box component="footer" sx={{ py: 3, textAlign: 'center', color: 'text.secondary' }}>
                Feito com ♥ — Jokenpo MUI
            </Box>
        </Box>
    )
}