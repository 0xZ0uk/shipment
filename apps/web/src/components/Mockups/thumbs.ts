// The block pickers' own thumbnails (`src/blocks/<Name>/thumbnail.ts`): the artwork editors see
// in "Add Layout", reused so the mockups show the picker as it is.
import { ctaThumbnail } from '@/blocks/Cta/thumbnail'
import { faqThumbnail } from '@/blocks/Faq/thumbnail'
import { featureRowsThumbnail } from '@/blocks/FeatureRows/thumbnail'
import { featuresThumbnail } from '@/blocks/Features/thumbnail'
import { formThumbnail } from '@/blocks/Form/thumbnail'
import { galleryThumbnail } from '@/blocks/Gallery/thumbnail'
import { heroThumbnail } from '@/blocks/Hero/thumbnail'
import { logosThumbnail } from '@/blocks/Logos/thumbnail'
import { pageHeaderThumbnail } from '@/blocks/PageHeader/thumbnail'
import { postsArchiveThumbnail } from '@/blocks/PostsArchive/thumbnail'
import { pricingThumbnail } from '@/blocks/Pricing/thumbnail'
import { reviewsThumbnail } from '@/blocks/Reviews/thumbnail'
import { richTextThumbnail } from '@/blocks/RichText/thumbnail'
import { statsThumbnail } from '@/blocks/Stats/thumbnail'
import { stepsThumbnail } from '@/blocks/Steps/thumbnail'
import { testimonialsThumbnail } from '@/blocks/Testimonials/thumbnail'

const svgs = {
  cta: ctaThumbnail,
  faq: faqThumbnail,
  featureRows: featureRowsThumbnail,
  features: featuresThumbnail,
  form: formThumbnail,
  gallery: galleryThumbnail,
  hero: heroThumbnail,
  logos: logosThumbnail,
  pageHeader: pageHeaderThumbnail,
  postsArchive: postsArchiveThumbnail,
  pricing: pricingThumbnail,
  reviews: reviewsThumbnail,
  richText: richTextThumbnail,
  stats: statsThumbnail,
  steps: stepsThumbnail,
  testimonials: testimonialsThumbnail,
}

export type ThumbName = keyof typeof svgs

const uris = new Map<ThumbName, string>()

/** A block thumbnail as a data URI, for an `<img>` (480×320 artwork). */
export const thumb = (name: ThumbName): string => {
  let uri = uris.get(name)
  if (!uri) {
    uri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgs[name].trim())}`
    uris.set(name, uri)
  }
  return uri
}
