import { createBrowserRouter } from "react-router";
import { DashboardPage } from "./pages/DashboardPage";
import { CardsPage } from "./pages/CardsPage";
import { Layout } from "./Layout";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: Layout,
    children: [
      {
        index: true,
        Component: DashboardPage,
      },
      {
        path: "cards",
        Component: CardsPage,
      },
      {
        path: "ab-tests",
        Component: DashboardPage,
      },
    ],
  },
]);
