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

        var unirest = require('unirest');
        var req = unirest('GET', url)
        
        if(base_url.startsWith('https:'))
            req.strictSSL(verifyCertificate)

        req.headers({
            'X-Vault-Token': token
        })
        .end(function (res: any) { 
            if (res.error) 
                reject(new Error(res.error)); 
            
            else if(!res.body.data)
                reject(new Error(tl.loc('dataOnPathNotExist'))); 

            else 
                resolve(res.body.data);
        });
    })
}