To update static resource, replace the files in LFS_SR directory, open it in the terminal and run:

```
zip -q LFS_SR.resource *.js -x "*.DS_Store" "__MACOSX/*" ".*" ".git/*" "node_modules/*"
```
