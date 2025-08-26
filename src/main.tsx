import React from "react";
import ReactDOM from "react-dom/client";
import { CssBaseline, ThemeProvider } from "@mui/material";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import theme from "@/theme";
import App from "./App";
import Game from "@/pages/Game";

const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    children: [{ index: true, element: <Game /> }],
  },
]);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <RouterProvider router={router} />
    </ThemeProvider>
  </React.StrictMode>
);
