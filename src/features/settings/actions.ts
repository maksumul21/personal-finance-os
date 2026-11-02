"use server";

import { revalidatePath } from "next/cache";
import { defineAction } from "@/server/action";
import { updatePreferences, updateProfile, updateTheme } from "@/server/services/settings.service";
import { preferencesSchema, profileSchema, themeSchema } from "./schemas";

export const updateProfileAction = defineAction(profileSchema, async ({ name }, user) => {
  await updateProfile(user.id, name);
  revalidatePath("/", "layout");
});

export const updatePreferencesAction = defineAction(preferencesSchema, async (values, user) => {
  await updatePreferences(user.id, values);
  revalidatePath("/", "layout");
});

export const updateThemeAction = defineAction(themeSchema, async ({ theme }, user) => {
  await updateTheme(user.id, theme);
});
