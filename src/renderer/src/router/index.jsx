import { createMemoryRouter } from "react-router";
import AppLayout from "../layouts/AppLayout";
import PageTransition from "../components/PageTransition";
import { DefaultOrderingEntry, GuestOnly, RequireAuth, RequireOrderingMenu, RequireTableOrdering } from "./guards";

import TableManage from "@pages/table-manage";
import TableMenu from "@pages/table-manage/TableMenu";
import BillOut from "@pages/table-manage/BillOut";
import OrderList from "@pages/table-manage/OrderList";
import Orders from "@pages/orders";
import Reports from "@pages/reports";
import ZReadingReports from "@pages/reports/z-reading-reports";

import Settings from "@pages/settings";
import Staff from "@pages/staff";
import StaffBreak from "@pages/staff/break";

import DeveloperLogs from "@pages/developer-logs";

const routes = [
  {
    element: <PageTransition />,
    children: [
      {
        path: "/login",
        element: <GuestOnly />,
      },

      {
        path: "/developer-logs",
        element: <DeveloperLogs />,
      },
      {
        path: "/",
        element: <RequireAuth />,
        children: [
          {
            path: "entry",
            element: <DefaultOrderingEntry />,
          },
          {
            path: "/",
            element: <AppLayout />,
            children: [
              {
                index: true,
                element: (
                  <RequireTableOrdering>
                    <TableManage />
                  </RequireTableOrdering>
                ),
              },
              {
                path: "table-menu/:tableId",
                element: (
                  <RequireOrderingMenu>
                    <TableMenu />
                  </RequireOrderingMenu>
                ),
                loader: ({ params }) => {
                  return { tableId: params.tableId };
                },
              },
              {
                path: "bill-out",
                element: <BillOut />,
              },
              {
                path: "table-order-list",
                element: (
                  <RequireTableOrdering>
                    <OrderList />
                  </RequireTableOrdering>
                ),
              },
              {
                path: "offline-orders",
                element: <Orders />,
              },
              {
                path: "cashier-reports",
                element: <Reports />,
              },
              {
                path: "cashier-reports/z-reading",
                element: <ZReadingReports />,
              },

              {
                path: "settings",
                element: <Settings />,
              },
              {
                path: "staff",
                element: <Staff />,
              },
              {
                path: "staff/break",
                element: <StaffBreak />,
              },
              {
                path: "developer-logs",
                element: <DeveloperLogs />,
              },
            ],
          },
        ],
      },
    ],
  },
];

const router = createMemoryRouter(routes, {
  // 应用启动和持久化登录恢复统一经过系统入口默认页规则。
  initialEntries: ["/entry"],
});

export default router;
