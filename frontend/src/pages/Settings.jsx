import { useAuth } from '@hooks/useAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@components/ui/card';
import { Badge } from '@components/ui/badge';
import { User, Mail, Calendar } from 'lucide-react';
import { format } from 'date-fns';

export default function Settings() {
  const { user } = useAuth();

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="mx-auto max-w-4xl px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold">Settings</h1>
          <p className="mt-2 text-muted-foreground">Manage your account settings and preferences</p>
        </div>

        {/* Account Information */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Account Information</CardTitle>
            <CardDescription>Your personal account details</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <User className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Name</p>
                <p className="text-sm text-muted-foreground">{user?.name}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Mail className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Email</p>
                <p className="text-sm text-muted-foreground">{user?.email}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Calendar className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Member since</p>
                <p className="text-sm text-muted-foreground">
                  {user?.createdAt && format(new Date(user.createdAt), 'MMMM d, yyyy')}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Features */}
        <Card>
          <CardHeader>
            <CardTitle>Available Features</CardTitle>
            <CardDescription>Current features enabled for your account</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Document Upload</p>
                <p className="text-sm text-muted-foreground">Upload SAP Note PDFs</p>
              </div>
              <Badge variant="success">Active</Badge>
            </div>

            <div className="flex items-center justify-between">
              <p className="font-medium">AI Chat Assistant</p>
              <Badge variant="success">Active</Badge>
            </div>

            <div className="flex items-center justify-between">
              <p className="font-medium">PDF Export</p>
              <Badge variant="success">Active</Badge>
            </div>

            <div className="flex items-center justify-between">
              <p className="font-medium">DOCX Export</p>
              <Badge variant="success">Active</Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}