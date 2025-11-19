import { type Static } from "@sinclair/typebox";
export declare const GetPetParamsSchema: import("@sinclair/typebox").TObject<{
    id: import("@sinclair/typebox").TNumber;
}>;
export declare const GetPetResponseSchema: import("@sinclair/typebox").TObject<{
    id: import("@sinclair/typebox").TNumber;
    name: import("@sinclair/typebox").TString;
    breed: import("@sinclair/typebox").TString;
    avatar_url: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    birth_date: import("@sinclair/typebox").TAny;
}>;
export type GetPetResponseDTO = Static<typeof GetPetResponseSchema>;
export declare const GetPetsResponseSchema: import("@sinclair/typebox").TArray<import("@sinclair/typebox").TObject<{
    id: import("@sinclair/typebox").TNumber;
    name: import("@sinclair/typebox").TString;
    breed: import("@sinclair/typebox").TString;
    avatar_url: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    birth_date: import("@sinclair/typebox").TAny;
}>>;
export type GetPetsResponseDTO = Static<typeof GetPetsResponseSchema>;
export declare const PostPetRequestSchema: import("@sinclair/typebox").TObject<{
    name: import("@sinclair/typebox").TString;
    breed: import("@sinclair/typebox").TString;
    avatar_url: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    birth_date: import("@sinclair/typebox").TAny;
}>;
export type PostPetRequestDTO = Static<typeof PostPetRequestSchema>;
export declare const PatchPetRequestSchema: import("@sinclair/typebox").TObject<{
    name: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    breed: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    avatar_url: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TString>;
    birth_date: import("@sinclair/typebox").TOptional<import("@sinclair/typebox").TAny>;
}>;
export type PatchPetRequestDTO = Static<typeof PatchPetRequestSchema>;
export declare const DeletePetResponseSchema: import("@sinclair/typebox").TObject<{
    success: import("@sinclair/typebox").TBoolean;
}>;
export type DeletePetResponseDTO = Static<typeof DeletePetResponseSchema>;
