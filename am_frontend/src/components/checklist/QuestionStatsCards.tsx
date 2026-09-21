import { FileText, Building2, TrendingUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface QuestionStatsProps {
  totalQuestions: number;
  activeIndustries: number;
  avgUsageRate: number;
}

export default function QuestionStatsCards({ totalQuestions, activeIndustries, avgUsageRate }: QuestionStatsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <Card className="kpi-card kpi-card-purple">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Total Questions</p>
              <h3 className="text-2xl font-bold">{totalQuestions.toLocaleString()}</h3>
            </div>
            <div className="h-12 w-12 rounded-full kpi-icon-purple flex items-center justify-center">
              <FileText className="h-6 w-6" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="kpi-card kpi-card-blue">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Active Industries</p>
              <h3 className="text-2xl font-bold">{activeIndustries}</h3>
            </div>
            <div className="h-12 w-12 rounded-full kpi-icon-blue flex items-center justify-center">
              <Building2 className="h-6 w-6" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="kpi-card kpi-card-green">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Avg. Usage Rate</p>
              <h3 className="text-2xl font-bold">{avgUsageRate}%</h3>
            </div>
            <div className="h-12 w-12 rounded-full kpi-icon-green flex items-center justify-center">
              <TrendingUp className="h-6 w-6" />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
