import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

// The app defines its own type scale (text-small, text-body, ...). Without telling
// tailwind-merge these are font sizes, it reads them as text colors and silently drops
// an earlier text color such as text-white.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        {
          text: [
            "display-xl",
            "display-l",
            "display-m",
            "page-title",
            "page-title-mobile",
            "section-title",
            "card-title",
            "body-lg",
            "body",
            "small",
            "caption",
          ],
        },
      ],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
