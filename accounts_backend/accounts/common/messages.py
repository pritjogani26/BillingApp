# accounts\common\messages.py
MESSAGES = {
    "CREATED": "{} record created successfully.",
    "UPDATED": "{} record updated successfully.",
    "ACTIVATED": "{} record activated successfully.",
    "DEACTIVATED": "{} record deactivated successfully.",
    "DISCARDED": "{} record discarded successfully.",
    "REMOVED": "{} record removed successfully.",
    "VERIFIED": "{} record verified successfully.",
    "VERIFICATION_REJECTED": "{} record verification rejected.",
    "EMAIL_SENT": "{} email sent successfully.",
    "WORKFLOW_SUBMITTED": "{} workflow submitted successfully.",
    "CLOSED": "{} record closed successfully.",
    "CANCELLED": "{} record cancelled successfully.",
    "VERSION_UPDATED": "{} record version updated successfully.",
    "COPIED": "{} record copied successfully.",
    "MOVED_TO_BIN": "{} record moved to recycle bin.",
    "RESTORED": "{} record restored successfully.",
    "SAVED": "{} record saved successfully.",
    "ALREADY_EXISTS": "{} record already exists.",
    "ID_REQUIRED": "{} ID is required.",
    "NOT_FOUND": "{} record not found. Please refresh and try again.",
    "RECORD_IN_USE": "This record is currently in use and cannot be modified.",
    "INVALID_CREDENTIALS": "Incorrect username or password.",
    "INVALID_PASSWORD": "Invalid password. Please try again.",
    "INVALID_SECONDARY_PASSWORD": "Incorrect secondary password.",
    "ALREADY_LOGGED_IN": "This account is already logged in with the same credentials.",
    "USER_ALREADY_EXISTS": "User ID or email already exists.",
    "INVALID_REQUEST": "Invalid request. Please check your input and try again.",
    "SOMETHING_WENT_WRONG": "Something went wrong. Please refresh and try again.",
    "DUPLICATE_NAME": "This name already exists. Please choose a different name.",
    "FOLDER_CREATED": "Folder created successfully.",
}


def get_message(message_type, value=""):
    """
    Returns standardized application messages.
    """

    if message_type == "FILE_UPLOAD":
        count = str(value)

        return (
            f"({count}) file uploaded."
            if count == "1"
            else f"({count}) files uploaded."
        )

    template = MESSAGES.get(message_type)

    if not template:
        return value

    return template.format(value)
