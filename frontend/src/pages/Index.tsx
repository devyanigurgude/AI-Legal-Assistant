import { Scale } from "lucide-react";
import { Link } from "react-router-dom";

const Index = () => {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center animate-fade-in">
        <Scale className="h-12 w-12 text-accent mx-auto mb-4" />
        <h1 className="mb-2 text-3xl font-display">LegalAI</h1>
        <p className="text-muted-foreground mb-6">AI-Powered Contract Management</p>
        <Link to="/login" className="text-accent hover:underline font-medium">
          Go to Dashboard →
        </Link>
      </div>
    </div>
  );
};

export default Index;
