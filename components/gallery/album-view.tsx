import { ArrowLeft, ImageOff } from "lucide-react";
import Link from "next/link";
import { ShareButton } from "@/components/share/share-button";
import { UploadButton } from "@/components/upload/upload-provider";
import { GalleryGrid } from "./gallery-grid";
import type { GalleryItem } from "./types";

export type AlbumData = {
  serviceId: string;
  serviceName: string;
  categoryId: string;
  categoryName: string;
  /** "Sun, Oct 12, 2025" */
  dateLine: string;
  items: GalleryItem[];
  canUpload: boolean;
  canDelete: boolean;
  /** Admins can make a link to this album for someone without an account. */
  canShare: boolean;
};

/** One category of one service, as a photo album. */
export function AlbumView({ data }: { data: AlbumData }) {
  return (
    <div className="stagger flex flex-col gap-6">
      <header className="flex flex-col gap-4">
        <Link
          href={`/services/${data.serviceId}`}
          className="flex items-center gap-1 self-start text-body-sm font-bold text-muted transition-colors hover:text-ink"
        >
          <ArrowLeft aria-hidden size={16} />
          {data.serviceName}
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="text-display text-ink tablet:text-hero">{data.categoryName}</h1>
            <p className="text-body-sm text-muted">
              {data.dateLine} · {data.items.length.toLocaleString("en-US")}{" "}
              {data.items.length === 1 ? "file" : "files"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {data.canUpload ? (
              <UploadButton
                serviceId={data.serviceId}
                categoryId={data.categoryId}
                label={`Add to ${data.categoryName}`}
              />
            ) : null}
            {data.canShare ? (
              <ShareButton
                serviceId={data.serviceId}
                categoryId={data.categoryId}
                covers={`${data.categoryName} from ${data.serviceName}, ${data.dateLine}`}
              />
            ) : null}
          </div>
        </div>
      </header>

      {data.items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg bg-surface shadow-card p-10 text-center">
          <ImageOff aria-hidden size={28} className="text-muted-soft" />
          <p className="text-body-sm text-muted">
            Nothing here yet. Files appear as soon as they finish uploading.
          </p>
        </div>
      ) : (
        <GalleryGrid items={data.items} canDelete={data.canDelete} />
      )}
    </div>
  );
}
