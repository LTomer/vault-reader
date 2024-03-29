import fs = require('fs');
import tl = require('azure-pipelines-task-lib/task');
import path = require('path');

export function createVariableFromObject(obj: any, depth = -2, obj_path = '')
{
    if(typeof obj !== 'object'){
        tl.setVariable(obj_path, String(obj), true)
        return
    }
    if(depth == 0)
        return

    let keys_1 = Object.keys(obj).sort();
    for (let k in keys_1)
    {
        let tmpKey = keys_1[k]
        createVariableFromObject(obj[tmpKey], depth > 0 ? depth - 1 : - 1, obj_path.length > 0 ? obj_path + "_" + tmpKey : tmpKey);
    }
}

function compareObjectsSchema(o1: any, o2: any, depth = -2, obj_path = '')
{
    if(typeof o1 !== 'object' || depth == 0)
        return true

    let keys_1 = Object.keys(o1).sort();
    let keys_2 = Object.keys(o2).sort();
    if(keys_1.length != keys_2.length){
        tl.debug(tl.loc("compareObjectNumberOfKeysNotEqual", obj_path))
        return false
    }

    let ret = true
    for (let k in keys_1)
    {
        let tmpKey = keys_1[k]
        if(!keys_2.includes(tmpKey)){
            tl.debug(tl.loc("compareObjectKeyNotExist", tmpKey))
            return false
        }

        let isCompare: boolean = compareObjectsSchema(o1[tmpKey], o2[tmpKey], depth > 0 ? depth - 1 : - 1, obj_path.length > 0 ? obj_path + "." + tmpKey : tmpKey);
        if(!isCompare){
            return false
        }
    }
    return ret
}

export function compareObjectSchemeToFile(obj: any, fileName: string, index: number){
    let readObj
    try{
        let rawdata: string = readFile(fileName)
        readObj = JSON.parse(rawdata)
    
        if(!compareObjectsSchema(obj, readObj)){
            tl.setResult(tl.TaskResult.Failed, tl.loc("secretNotEqualToSchema", index));
            return false
        }
    }
    catch(error){
        tl.error(error);
        tl.setResult(tl.TaskResult.Failed, tl.loc("loadJsonFromFileFail", index));
        return false
    }

    return true;
}

export function replaceAction(obj: any, fileName: string, index: number){
    try{
        let content: string = readFile(fileName)
    
        let keys = Object.keys(obj).sort();

        for (let k in keys)
        {
            let key = keys[k]
            let value = obj[key]

            let replaceKey = `__${key}__`
            
            var re = new RegExp(replaceKey, 'g');
            content = content.replace(re, value);
        }

        return content
    }
    catch(error){
        tl.error(error);
        tl.setResult(tl.TaskResult.Failed, tl.loc("actionReplaceFail", index));
        return undefined
    }
}

export function exportAction(obj: any, index: number, lineFormat: string){
    try{
        let keys = Object.keys(obj).sort();

        let replaceKey = "%%KEY%%"
        let replaceValue = "%%VALUE%%"

        let newlineFlag = false
        let isObjectFlag = false
        let lines : string[] = []
        for (let k in keys)
        {
            
            let key: string = keys[k].toString()
            let value: string = obj[key].toString()

            if(typeof obj[key] == "object"){
                isObjectFlag = true
                continue
            }

            if(!newlineFlag && (key.includes("\n") || value.includes("\n"))){
                newlineFlag = true
            }

            let content = lineFormat.replace(replaceKey, key).replace(replaceValue, value);
            lines.push(content)
        }

        if(isObjectFlag){
            tl.warning(tl.loc("actionExpObjWarning", index));
        }
        if(newlineFlag){
            tl.warning(tl.loc("actionExpWarning", index));
        }

        return lines
    }
    catch(error){
        tl.error(error);
        tl.setResult(tl.TaskResult.Failed, tl.loc("actionExportFail", index));
        return undefined
    }
}

export function readFile(fileName: string){
    let workingdir: string = tl.getVariable('SYSTEM.DEFAULTWORKINGDIRECTORY')
    let fullPath = path.join(workingdir, fileName)
    
    if(!fs.existsSync(fullPath) || !tl.stats(fullPath).isFile()){
        fullPath = fileName
    }

    if(!fs.existsSync(fullPath) || !tl.stats(fullPath).isFile())
        throw new Error(tl.loc('invalidFilePath', fullPath));
        
    let content: string = fs.readFileSync(fullPath, 'utf8')
    return content
}

export function writeToFile(filename: string, value: any) {
    fs.writeFile(filename, value, (err) => {
        if (err) {
            throw new Error(tl.loc('writeToFileFail'));
        }
    });
}

function buildLoginUrl(base_url: string, auth_type: string, user: string, password: string){
    let data = {};
    let pathType: string

    switch(auth_type) {
        case "ldap":
            data = { "password": password }
            pathType = pathJoin("/", "/ldap/login/", user)
            break;
        case "userpass":
            data = { "password": password }
            pathType = pathJoin("/", "/userpass/login/", user)
            break;
        default:
            throw new Error(tl.loc('loginTypeNotValid'));
      }

      let url: string = pathJoin("/", base_url, "/v1/auth", pathType)

      return [url, data];
}

function pathJoin(sep: string, ...parts: any[]) {
    return parts
      .map(part => {
        const part2 = part.endsWith(sep) ? part.substring(0, part.length - 1) : part;
        return part2.startsWith(sep) ? part2.substr(1) : part2;
      })
      .join(sep);
}

export function getVaultToken(base_url: string, auth_type: string, user: string, password: string, verifyCertificate: boolean = true): Promise<string> {
    return new Promise((resolve, reject) => {
        let url_res = buildLoginUrl(base_url, auth_type, user, password);

        let url = url_res[0]
        let data = url_res[1]

        var unirest = require('unirest');
        var req = unirest('POST', url)
        
        if(base_url.startsWith('https:'))
            req.strictSSL(verifyCertificate)

        req.headers({
            'Content-Type': 'application/json'
        })
        .send(JSON.stringify(data))
        .end(function (res: any) { 
            if (res.error) 
                reject(new Error(res.error.message)); 
            
            else if (!res.body.auth || !res.body.auth.client_token) 
                reject(new Error(tl.loc('tokenPropertyNotExist'))); 
                
            else resolve(res.body.auth.client_token.toString());
        });
    })
}

export function getPathDetailes(base_url: string, sec_path: string, token: string, verifyCertificate: boolean = true): Promise<string> {
    return new Promise((resolve, reject) => {
        let url = pathJoin("/", base_url, "/v1", sec_path);
        tl.debug("url=" + url);

        var unirest = require('unirest');
        var req = unirest('GET', url)
        
        if(base_url.startsWith('https:'))
            req.strictSSL(verifyCertificate)

        req.headers({
            'X-Vault-Token': token
        })
        .end(function (res: any) { 
            if (res.error) {
                if (res.body.warnings && res.body.warnings[0])
                    reject(new Error(res.error + " [url=" + url + ", warning=" + res.body.warnings[0] +"]")); 
                else if (res.body.errors && res.body.errors[0])
                    reject(new Error(res.error + " [url=" + url + ", error=" + res.body.errors[0] +"]")); 
                else
                    reject(new Error(res.error + " [url=" + url +"]")); 
            }
            else {
                let kv_version = 1
                if (res.body.data.metadata)
                    kv_version = 2

                if (kv_version == 1) {
                    if(!res.body.data)
                        reject(new Error(tl.loc('dataOnPathNotExist', kv_version)));
                    resolve(res.body.data);
                }
                else if (kv_version == 2) {
                    if (!res.body.data.data)
                        reject(new Error(tl.loc('dataOnPathNotExist', kv_version)));
                    resolve(res.body.data.data);
                }
                else {
                    reject(new Error(tl.loc('unknowKVVersion', kv_version))); 
                }
            }
                
        });
    })
}

export async function getKV2PathDetailes(base_url: string, sec_path: string, token: string, verifyCertificate: boolean = true): Promise<string> {
    try{
        //read detail from KV v2
        let sec_path_v2 = sec_path.replace("/","/data/")
        return await getPathDetailes(base_url, sec_path_v2, token, verifyCertificate)
    }
    catch(error){
        //read detail from KV v1
        tl.debug(tl.loc('KV2NotSupported'));
        return await getPathDetailes(base_url, sec_path, token, verifyCertificate)
    }
}

export function addVariable(var_list: {[index: string]: string;}, key: string, value: string){
    if( var_list[key] ){
        tl.setResult(tl.TaskResult.SucceededWithIssues, tl.loc("variableAlreadyExist", key));
    }
    else{
        var_list[key]=value
        tl.debug(tl.loc("setVariable", key));
    }
}