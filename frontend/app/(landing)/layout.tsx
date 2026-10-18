import "./landing.css";

// The landing and the Enter screen share this route group so the overview can live at /dashboard
// without touching the root layout.
export default function LandingLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
