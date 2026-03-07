import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/context/AuthContext";
import { ChatProvider } from "@/context/ChatContext";
import Login from "@/components/Auth/Login";
import Register from "@/components/Auth/Register";
import ProtectedRoute from "@/components/Auth/ProtectedRoute";
import DashboardLayout from "@/components/Layout/DashboardLayout";
import OverviewPage from "@/pages/OverviewPage";
import ContractsPage from "@/pages/ContractsPage";
import AnalysisPage from "@/pages/AnalysisPage";
import ChatPage from "@/pages/ChatPage";
import ReportsPage from "@/pages/ReportsPage";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <ChatProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Navigate to="/login" replace />} />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route
                path="/dashboard"
                element={
                  <ProtectedRoute>
                    <DashboardLayout />
                  </ProtectedRoute>
                }
              >
                <Route index element={<OverviewPage />} />
                <Route path="contracts" element={<ContractsPage />} />
                <Route path="analysis" element={<AnalysisPage />} />
                <Route path="chat" element={<ChatPage />} />
                <Route path="reports" element={<ReportsPage />} />
              </Route>
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </ChatProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
