import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { User } from "lucide-react";
import { ProfileContent } from "./ProfileContent";

interface ProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ProfileDialog({ open, onOpenChange }: ProfileDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto rounded-sm sm:rounded-sm">
        <DialogHeader className="shrink-0 mb-4">
          <DialogTitle className="flex items-center gap-2">
            Profil Pengguna
          </DialogTitle>
          <DialogDescription className="sr-only">Informasi profil dan foto Anda</DialogDescription>
        </DialogHeader>

        <ProfileContent />
      </DialogContent>
    </Dialog>
  );
}
