const {Menu,nativeTheme}=require('electron');
function installMenu(){
  nativeTheme.themeSource='dark';
  Menu.setApplicationMenu(null);
}
module.exports={installMenu};
