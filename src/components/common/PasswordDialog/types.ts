export interface PasswordDialogProps {
  /** Dialog visibility */
  open: boolean
  /** Password to display and copy */
  password: string
  /** Heading, e.g. "User created" or "New password" */
  caption: string
}