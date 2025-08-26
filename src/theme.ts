import { createTheme } from '@mui/material/styles'


const theme = createTheme({
    palette: {
        mode: 'light',
        primary: { main: '#1e40af' }, // azul forte
        secondary: { main: '#0ea5e9' },
        background: { default: '#f7f7fb' },
    },
    shape: { borderRadius: 14 },
    typography: { fontFamily: 'Inter, system-ui, Roboto, Arial, sans-serif' },
})


export default theme