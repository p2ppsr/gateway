import { toast } from "react-toastify"

export const copyLinkToClipboard = (link: string) => {
  navigator.clipboard.writeText(link).then(
    () => {
      toast.success('Song link copied to clipboard')
    },
    e => {
      console.error('Failed to copy link. Error: ', e)
      toast.error('Failed to copy link. Error: ', e)
    }
  )
}