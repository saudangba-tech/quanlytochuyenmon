import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { firebaseReady } from './firebase.js';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import { PageLoader, ToastProvider } from './components/ui.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import { Pending, Setup, MissingConfig, DataError } from './pages/Gate.jsx';
import Dashboard from './pages/Dashboard.jsx';

const QuestionBank = lazy(() => import('./pages/QuestionBank.jsx'));
const AddQuestions = lazy(() => import('./pages/AddQuestions.jsx'));
const Review = lazy(() => import('./pages/Review.jsx'));
const Exams = lazy(() => import('./pages/Exams.jsx'));
const ExamBuilder = lazy(() => import('./pages/ExamBuilder.jsx'));
const ExamPrint = lazy(() => import('./pages/ExamPrint.jsx'));
const Records = lazy(() => import('./pages/Records.jsx'));
const Leaderboard = lazy(() => import('./pages/Leaderboard.jsx'));
const Members = lazy(() => import('./pages/Members.jsx'));
const SettingsPage = lazy(() => import('./pages/Settings.jsx'));

function Guarded() {
  const { user, profile, loading, needSetup, isMember, isManager, isLeader, error } = useAuth();
  if (loading) return <PageLoader text="Đang kiểm tra đăng nhập…" />;
  if (!user) return <Login />;
  if (needSetup) return <Setup />;
  if (!profile) return error ? <DataError message={error} /> : <PageLoader text="Đang tạo hồ sơ…" />;
  if (!isMember) return <Pending />;
  const manager = (el) => (isManager ? el : <Navigate to="/" replace />);
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/de-thi/:id/in" element={manager(<ExamPrint />)} />
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="ngan-hang" element={<QuestionBank />} />
          <Route path="them-cau-hoi" element={<AddQuestions />} />
          <Route path="sua-cau-hoi/:id" element={<AddQuestions />} />
          <Route path="duyet" element={manager(<Review />)} />
          <Route path="de-thi" element={manager(<Exams />)} />
          <Route path="de-thi/tao" element={manager(<ExamBuilder />)} />
          <Route path="ho-so" element={<Records />} />
          <Route path="thi-dua" element={<Leaderboard />} />
          <Route path="thanh-vien" element={<Members />} />
          <Route path="cai-dat" element={isLeader ? <SettingsPage /> : <Navigate to="/" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </Suspense>
  );
}

export default function App() {
  if (!firebaseReady) return <MissingConfig />;
  return (
    <ToastProvider>
      <AuthProvider>
        <Guarded />
      </AuthProvider>
    </ToastProvider>
  );
}
