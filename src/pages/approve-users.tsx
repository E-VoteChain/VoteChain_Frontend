import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import {
  Search,
  User,
  Shield,
  X,
  Eye,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
} from "lucide-react";
import {
  useApproveUserMutation,
  usePendingUsers,
  useRejectUserMutation,
} from "@/hooks/use-admin";
import { Loader } from "@/components/ui/loader";
import { useSearchParams } from "react-router";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getStatusBadge } from "@/utils/status-badge";
import { UserDetailsDialog } from "@/components/shared/admin/approve-users/users-with-dialog";
import { handleAxiosError } from "@/utils/errorHandler";
import Pagination from "@/components/shared/pagination";
import { getAdminContract } from "@/utils/getContracts";
import { api } from "@/api/axios";

type Location = {
  state_name: string;
  district_name: string;
  mandal_name: string;
  constituency_name: string;
};

type User = {
  id: string;
  walletAddress: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  profileImage: string;
  aadharImage: string;
  aadharNumber: string;
  dob: string;
  location: Location[];
  createdAt: string;
  submittedAt: string;
};

const types = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
};

const REJECTION_REASONS = [
  { value: "invalid_id", label: "Invalid ID proof" },
  { value: "unclear_photo", label: "Unclear photo" },
  { value: "mismatch_info", label: "Information mismatch with Aadhaar" },
  { value: "incomplete_details", label: "Incomplete details" },
  { value: "duplicate_account", label: "Duplicate account detected" },
  { value: "other", label: "Other reason" },
];

const REJECTION_FIELD_BUTTONS = [
  { label: "Profile Image", value: "profileImage" },
  { label: "Aadhaar Image", value: "aadharImage" },
  { label: "First Name", value: "firstName" },
  { label: "Last Name", value: "lastName" },
  { label: "Phone Number", value: "phoneNumber" },
  { label: "Email", value: "email" },
  { label: "Address", value: "updateLocation" },
];

const InfoRow = ({ label, value }: { label: string; value: string }) => (
  <div>
    <span className="text-muted-foreground">{label}:</span> {value}
  </div>
);

export default function ApproveUsersPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [customReason, setCustomReason] = useState("");
  const [approveDialogOpen, setApproveDialogOpen] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectionFields, setRejectionFields] = useState<string[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [rejectedReason, setRejectedReason] = useState<string>("");
  const [searchParams, setSearchParams] = useSearchParams();
  const [userDetailsDialogOpen, setUserDetailsDialogOpen] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const status = searchParams.get("status") || "pending";
  const currentPage = parseInt(searchParams.get("page") || "1", 10);

  const { data, isLoading, refetch } = usePendingUsers({
    page: currentPage,
    limit: 4,
    filter: { status: status.toUpperCase() },
    sortBy: "createdAt:desc",
    populate: "userDetails,userLocation",
  });

  const approveUser = useApproveUserMutation();
  const rejectUser = useRejectUserMutation();

  const totalPages = data?.query?.totalPages || 1;

  const goToPage = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      searchParams.set("page", page.toString());
      setSearchParams(searchParams);
    }
  };

  const goToNextPage = () => {
    if (currentPage < totalPages) {
      goToPage(currentPage + 1);
    }
  };

  const goToPreviousPage = () => {
    if (currentPage > 1) {
      goToPage(currentPage - 1);
    }
  };

  const filteredUsers = useMemo(() => {
    const users = data?.data || [];
    if (isLoading || users.length === 0) return [];
    return users.filter(
      (user: User) =>
        user.firstName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.lastName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.walletAddress.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [isLoading, data, searchTerm]);

  const handleApprove = (user: User) => {
    setSelectedUser(user);
    setApproveDialogOpen(true);
  };

  const handleReject = (user: User) => {
    setSelectedUser(user);
    setRejectDialogOpen(true);
  };

  const confirmApprove = async () => {
    try {
      setIsApproving(true);

      const adminContract = await getAdminContract();
      const tx = await adminContract.approveUser(
        selectedUser?.walletAddress,
        1
      );

      const receipt = await tx.wait();
      const payload = {
        transactionHash: receipt.hash,
        from: receipt.from,
        to: receipt.to,
        blockNumber: receipt.blockNumber,
        status: receipt.status === 1 ? "SUCCESS" : "FAILED",
        amount: receipt.gasUsed.toString(),
        type: "USER VERIFIED",
      };

      approveUser.mutate(
        { userId: selectedUser!.id },
        {
          onSuccess: async () => {
            setApproveDialogOpen(false);
            await api.post("/api/v1/auth/create-transaction", payload);
          },
          onError: (error) => handleAxiosError(error),
        }
      );
    } catch (err) {
      toast.error("Approval failed: " + (err as Error).message);
    } finally {
      setIsApproving(false);
    }
  };

  const confirmReject = async () => {
    if (!rejectedReason.trim() && rejectionFields.length === 0) {
      toast.error("Please provide a reason for rejection.");
      return;
    }
    if (rejectedReason.trim() === "other" && !rejectionFields.length) {
      toast.error("Please provide a reason for rejection.");
      return;
    }
    if (rejectionFields.length === 0) {
      toast.error("Please select at least one field to update.");
      return;
    }

    if (rejectedReason.trim() === "other" && !customReason.trim()) {
      toast.error("Please provide a custom reason for rejection.");
      return;
    }

    try {
      setIsRejecting(true);
      const adminContract = await getAdminContract();
      const tx = await adminContract.rejectUser(selectedUser?.walletAddress);
      const receipt = await tx.wait();

      const payload = {
        transactionHash: receipt.hash,
        from: receipt.from,
        to: receipt.to,
        blockNumber: receipt.blockNumber,
        status: receipt.status === 1 ? "SUCCESS" : "FAILED",
        amount: receipt.gasUsed.toString(),
        type: "USER REJECTED",
      };

      rejectUser.mutate(
        {
          userId: selectedUser!.id,
          reason:
            rejectedReason.trim() === "other" ? customReason : rejectedReason,
          rejectedFields: rejectionFields,
        },
        {
          onSuccess: async () => {
            setRejectDialogOpen(false);
            await api.post("/api/v1/auth/create-transaction", payload);
          },
          onError: (error) => handleAxiosError(error),
        }
      );

      setRejectionFields([]);
      setRejectedReason("");
      setCustomReason("");
      setSelectedUser(null);
    } catch (err) {
      toast.error("Rejection failed: " + (err as Error).message);
    } finally {
      setIsRejecting(false);
    }
  };

  const toggleRejectionField = (field: string) => {
    setRejectionFields((prev) =>
      prev.includes(field) ? prev.filter((f) => f !== field) : [...prev, field]
    );
  };

  const handleTabChange = (newTab: string) => {
    setSearchParams({ status: newTab, page: "1" });
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  return (
    <div>
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">User Management</h1>
          <p className="text-muted-foreground mt-1">
            Approve new users and manage existing ones
          </p>
        </div>
        <Button
          variant="outline"
          className="mt-4 md:mt-0"
          size="sm"
          onClick={handleRefresh}
          disabled={refreshing}
        >
          <RefreshCw
            className={cn("h-4 w-4 mr-2", {
              "animate-spin": refreshing,
            })}
          />
          Refresh
        </Button>
      </div>
      <div className="mb-6">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
          <Input
            placeholder="Search users by name, email, or wallet address..."
            className="pl-10"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>
      <Tabs value={status} onValueChange={handleTabChange} className="mb-6">
        <TabsList className="mb-6">
          {Object.entries(types).map(([key, value]) => (
            <TabsTrigger key={key} value={key} className="relative">
              {value}
            </TabsTrigger>
          ))}
        </TabsList>

        {Object.entries(types).map(([key, value]) => (
          <TabsContent key={key} value={key}>
            {isLoading ? (
              <div className="flex items-center justify-center h-64">
                <Loader
                  text={`Hang tight! We're gathering the latest list of ${value} users...`}
                  size="lg"
                />
              </div>
            ) : filteredUsers.length === 0 ? (
              <Card>
                <CardContent className="pt-6 text-center text-muted-foreground">
                  No {value} users found.
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {filteredUsers.map((user: User) => {
                  const location = user.location[0];
                  return (
                    <Card key={user.id} className="p-4">
                      <div className="flex flex-col md:flex-row gap-4">
                        <div className="flex-shrink-0">
                          <Avatar className="h-16 w-16">
                            {user.profileImage ? (
                              <AvatarImage
                                src={user.profileImage}
                                alt={user.firstName}
                              />
                            ) : (
                              <AvatarFallback>
                                <User className="h-8 w-8" />
                              </AvatarFallback>
                            )}
                          </Avatar>
                        </div>

                        <div className="flex-grow space-y-2">
                          <div className="flex flex-col md:flex-row md:items-center md:justify-between">
                            <div>
                              <h3 className="font-medium text-lg">
                                {user.firstName} {user.lastName}
                              </h3>
                              <p className="text-sm text-muted-foreground">
                                {user.walletAddress}
                              </p>
                            </div>
                            <div className="mt-2 md:mt-0">
                              {getStatusBadge(user.status)}
                            </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
                            <InfoRow label="Email" value={user.email} />
                            <InfoRow
                              label="Phone"
                              value={`+91 ${user.phoneNumber}`}
                            />
                            {location && (
                              <InfoRow
                                label="Location"
                                value={`${location?.constituency_name}, ${location?.mandal_name}, ${location?.district_name}, ${location?.state_name}`}
                              />
                            )}
                          </div>
                          <div className="flex flex-wrap gap-2 mt-4">
                            <Button
                              variant={"outline"}
                              size={"sm"}
                              onClick={() => {
                                setSelectedUser(user);
                                setUserDetailsDialogOpen(true);
                              }}
                            >
                              <Eye className="h-4 w-4 mr-2" />
                              View Details
                            </Button>

                            {user.status === "PENDING" && (
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="text-green-500 hover:text-green-700"
                                  onClick={() => handleApprove(user)}
                                >
                                  <CheckCircle className="h-4 w-4 mr-1" />{" "}
                                  Approve user
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="text-red-500 hover:text-red-700"
                                  onClick={() => handleReject(user)}
                                >
                                  <X className="h-4 w-4" /> Reject user
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>
      {totalPages > 1 && (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          goToPage={goToPage}
          goToNextPage={goToNextPage}
          goToPreviousPage={goToPreviousPage}
        />
      )}

      <AlertDialog open={approveDialogOpen} onOpenChange={setApproveDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Approve User</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to approve {selectedUser?.firstName}{" "}
              {selectedUser?.lastName}? This will allow them to participate in
              elections.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={approveUser.isPending || isApproving}>
              Cancel
            </AlertDialogCancel>
            <Button
              onClick={confirmApprove}
              className="bg-green-600 hover:bg-green-700"
              disabled={approveUser.isPending || isApproving}
            >
              {approveUser.isPending || isApproving ? (
                <Loader
                  size="sm"
                  className="border-white border-t-transparent"
                />
              ) : (
                <Shield className="h-4 w-4" />
              )}
              Approve User
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center">
              <AlertTriangle className="h-5 w-5 mr-2 text-destructive" />
              Reject User
            </AlertDialogTitle>
            <AlertDialogDescription>
              Please provide details for rejecting {selectedUser?.firstName}{" "}
              {selectedUser?.lastName}'s application.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="p-6 pt-0 space-y-4">
            <div className="space-y-2">
              <h4 className="text-sm font-medium">Rejection Reason</h4>
              <Select value={rejectedReason} onValueChange={setRejectedReason}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a reason" />
                </SelectTrigger>
                <SelectContent>
                  {REJECTION_REASONS.map((reason) => (
                    <SelectItem key={reason.value} value={reason.value}>
                      {reason.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {rejectedReason === "other" && (
                <Textarea
                  placeholder="Please specify the reason for rejection..."
                  value={customReason}
                  onChange={(e) => setCustomReason(e.target.value)}
                  className="min-h-[80px] mt-2"
                />
              )}
            </div>

            <div className="space-y-2">
              <h4 className="text-sm font-medium">Fields to Update</h4>
              <p className="text-sm text-muted-foreground">
                Select the fields that need to be updated by the user:
              </p>
              <div className="grid grid-cols-2 gap-2 mt-2">
                {REJECTION_FIELD_BUTTONS.map((field) => (
                  <Button
                    key={field.value}
                    type="button"
                    variant={
                      rejectionFields.includes(field.value)
                        ? "default"
                        : "outline"
                    }
                    size="sm"
                    onClick={() => toggleRejectionField(field.value)}
                    className="justify-start"
                  >
                    {field.label}
                  </Button>
                ))}
              </div>
            </div>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={rejectUser.isPending || isRejecting}>
              Cancel
            </AlertDialogCancel>
            <Button
              onClick={confirmReject}
              className="bg-red-600 hover:bg-red-700"
              disabled={rejectUser.isPending || isRejecting}
            >
              {rejectUser.isPending || isRejecting ? (
                <Loader
                  size="sm"
                  className="border-white border-t-transparent"
                />
              ) : (
                <X className="h-4 w-4" />
              )}
              Reject
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {selectedUser && (
        <UserDetailsDialog
          user={selectedUser}
          open={userDetailsDialogOpen}
          onOpenChange={setUserDetailsDialogOpen}
        />
      )}
    </div>
  );
}
