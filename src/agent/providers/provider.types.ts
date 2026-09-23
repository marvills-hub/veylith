export interface AIProviderStatus{
 name:string;
 model:string;
 configured:boolean;
 local:boolean;
 endpoint:string|null;
}
export interface AIProvider{
 readonly name:string;
 readonly model:string;
 readonly configured:boolean;
 readonly local:boolean;
 readonly endpoint:string|null;
 json<T=any>(system:string,prompt:string,taskId:string,projectId:string):Promise<T>;
 health():Promise<AIProviderStatus>;
}
