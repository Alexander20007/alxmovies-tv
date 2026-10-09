import { supabase } from "@/lib/supabase";
import type { MediaType } from "@/types";

export type RatingValue = "liked" | "loved" | "disliked";
export interface RatingSummary { liked: number; loved: number; disliked: number }

export async function getRating(profileId: string, mediaId: number, mediaType: MediaType): Promise<RatingValue | null> {
  const { data, error } = await supabase.from("ratings").select("rating")
    .eq("profile_id", profileId).eq("media_id", mediaId).eq("media_type", mediaType).maybeSingle();
  if (error) throw error;
  return (data?.rating as RatingValue) ?? null;
}

export async function setRating(profileId: string, mediaId: number, mediaType: MediaType, title: string, rating: RatingValue) {
  const { error } = await supabase.from("ratings").upsert(
    { profile_id: profileId, media_id: mediaId, media_type: mediaType, title, rating },
    { onConflict: "profile_id,media_id,media_type" }
  );
  if (error) throw error;
}

export async function getRatingSummary(mediaId: number, mediaType: MediaType): Promise<RatingSummary> {
  const { data, error } = await supabase.from("ratings").select("rating").eq("media_id", mediaId).eq("media_type", mediaType);
  if (error) throw error;
  const sum: RatingSummary = { liked: 0, loved: 0, disliked: 0 };
  (data ?? []).forEach((r) => { if (r.rating in sum) sum[r.rating as RatingValue]++; });
  return sum;
}

export interface CommentRow {
  id: string;
  profile_id: string;
  body: string;
  created_at: string;
  parent_comment_id: string | null;
  profiles?: { name: string; avatar?: string | null } | null;
}

export async function fetchComments(mediaId: number, mediaType: MediaType) {
  const { data, error } = await supabase.from("comments").select("*, profiles(name, avatar)")
    .eq("media_id", mediaId).eq("media_type", mediaType).order("created_at", { ascending: false });
  if (error) throw error;
  return data as CommentRow[];
}

export async function addComment(profileId: string, mediaId: number, mediaType: MediaType, body: string, parentId: string | null = null) {
  const { error } = await supabase.from("comments").insert({
    profile_id: profileId, media_id: mediaId, media_type: mediaType, body, parent_comment_id: parentId,
  });
  if (error) throw error;
}

export async function deleteComment(commentId: string) {
  const { error } = await supabase.from("comments").delete().eq("id", commentId);
  if (error) throw error;
}

export async function toggleCommentLike(profileId: string, commentId: string) {
  const { data: existing, error: lookup } = await supabase.from("comment_likes").select("id")
    .eq("comment_id", commentId).eq("profile_id", profileId).maybeSingle();
  if (lookup) throw lookup;
  if (existing) {
    const { error } = await supabase.from("comment_likes").delete().eq("id", existing.id);
    if (error) throw error;
    return;
  }
  const { error } = await supabase.from("comment_likes").insert({ comment_id: commentId, profile_id: profileId });
  if (error) throw error;
}

export type LikesInfo = Record<string, { count: number; likedByMe: boolean }>;

export async function fetchCommentLikes(commentIds: string[], profileId: string): Promise<LikesInfo> {
  const info: LikesInfo = {};
  commentIds.forEach((id) => (info[id] = { count: 0, likedByMe: false }));
  if (!commentIds.length) return info;
  const { data, error } = await supabase.from("comment_likes").select("comment_id, profile_id").in("comment_id", commentIds);
  if (error) throw error;
  (data ?? []).forEach((r) => {
    const e = (info[r.comment_id] ??= { count: 0, likedByMe: false });
    e.count++;
    if (r.profile_id === profileId) e.likedByMe = true;
  });
  return info;
}
