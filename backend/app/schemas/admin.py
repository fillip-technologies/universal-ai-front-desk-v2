from pydantic import BaseModel


class SetKeyRequest(BaseModel):
    key: str
