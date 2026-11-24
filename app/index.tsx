import { useState } from "react";
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";

const C = { bg: "#090B0E", surface: "#11151A", raised: "#171D24", border: "#252D36", text: "#F4F6F8", muted: "#929DA8", orange: "#FF6A2A", orangeSoft: "#3A2118", green: "#8DD7B0" };
const missions = [
  { id: "RN-2048", type: "DOCUMENT RUN", title: "Signed contract", from: "Rosebank", to: "Sandton", distance: "6.2 km", reward: "R 180", urgency: "PRIORITY" },
  { id: "RN-2051", type: "PERSONAL RUN", title: "Keys to the studio", from: "Parkhurst", to: "Melville", distance: "8.4 km", reward: "R 145", urgency: "STANDARD" },
  { id: "RN-2056", type: "BUSINESS RUN", title: "Retail collection", from: "Fourways", to: "Bryanston", distance: "11 km", reward: "R 260", urgency: "SCHEDULED" }
];
type Mode = "discover" | "request";

export default function HomeScreen() {
  const [mode, setMode] = useState<Mode>("discover");
  const [selected, setSelected] = useState<string | null>(null);
  const { width } = useWindowDimensions();
  const wide = width >= 760;
  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.page} showsVerticalScrollIndicator={false}>
        <View style={[s.topbar, wide && s.topbarWide]}>
          <View style={s.wordmark}><View style={s.mark}><View style={s.markCut} /></View><Text style={s.logo}>RUNNER<Text style={s.orange}>.</Text></Text></View>
          <View style={s.topRight}><View style={s.status}><View style={s.liveDot}/><Text style={s.statusText}>NETWORK ONLINE</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Open profile" style={s.avatar}><Text style={s.avatarText}>R</Text></Pressable></View>
        </View>
        <View style={[s.hero, wide && s.heroWide]}>
          <View style={s.heroCopy}>
            <Text style={s.eyebrow}>THE WORLD DOESN'T WAIT.</Text>
            <Text style={s.headline}>MAKE IT{"\n"}<Text style={s.orange}>HAPPEN.</Text></Text>
            <Text style={s.subhead}>A new network for people who get things there. Find a mission. Become a Runner. Move the world forward.</Text>
            <View style={s.actions}>
              <Pressable accessibilityRole="button" onPress={() => setMode("discover")} style={s.primary}><Text style={s.primaryText}>FIND A MISSION ↗</Text></Pressable>
              <Pressable accessibilityRole="button" onPress={() => setMode("request")} style={s.secondary}><Text style={s.secondaryText}>REQUEST A RUN</Text></Pressable>
            </View>
          </View>
          <View style={s.heroPanel}>
            <View style={s.panelTop}><Text style={s.panelLabel}>RUNNER NETWORK / 001</Text><Text style={s.panelLive}>● LIVE</Text></View>
            <View style={s.routeVisual}><View style={s.routeLine}/><View style={[s.routePoint,s.routeStart]}><View style={s.routeCore}/></View><View style={[s.routePoint,s.routeEnd]}><View style={s.routeCore}/></View><View style={s.routeTag}><Text style={s.routeTagText}>YOUR CITY. YOUR MOVE.</Text></View></View>
            <View style={s.panelBottom}><View><Text style={s.metricValue}>24/7</Text><Text style={s.metricLabel}>READY WHEN YOU ARE</Text></View><View style={s.metricDivider}/><View><Text style={s.metricValue}>01 → ∞</Text><Text style={s.metricLabel}>EVERY MISSION COUNTS</Text></View></View>
          </View>
        </View>
        <View style={s.sectionHeader}><View><Text style={s.eyebrow}>THE OPEN NETWORK</Text><Text style={s.sectionTitle}>{mode === "discover" ? "MISSIONS IN MOTION" : "START A MISSION"}</Text></View><Text style={s.sectionMeta}>JOHANNESBURG / ZA</Text></View>
        {mode === "discover" ? <View style={[s.missionGrid, wide && s.missionGridWide]}>{missions.map(m => (
          <Pressable key={m.id} accessibilityRole="button" accessibilityState={{ selected: selected === m.id }} onPress={() => setSelected(selected === m.id ? null : m.id)} style={[s.missionCard, selected === m.id && s.missionCardSelected]}>
            <View style={s.cardTop}><Text style={s.cardType}>{m.type}</Text><Text style={[s.urgency, m.urgency === "PRIORITY" && s.urgencyPriority]}>{m.urgency}</Text></View>
            <Text style={s.missionTitle}>{m.title}</Text>
            <View style={s.locations}><View style={s.locationRail}><View style={s.locationDot}/><View style={s.locationStem}/><View style={[s.locationDot,s.locationDotEnd]}/></View><View style={s.locationText}><Text style={s.locationName}>{m.from}</Text><Text style={s.locationName}>{m.to}</Text></View></View>
            <View style={s.cardFooter}><View><Text style={s.distance}>{m.distance.toUpperCase()} ROUTE</Text><Text style={s.missionId}>{m.id}</Text></View><View style={s.rewardWrap}><Text style={s.reward}>{m.reward}</Text><Text style={s.rewardLabel}>MISSION REWARD</Text></View></View>
            {selected === m.id && <View style={s.selectedNote}><Text style={s.selectedNoteText}>PREVIEW ONLY · LIVE ASSIGNMENT NOT CONNECTED</Text></View>}
          </Pressable>
        ))}</View> : <View style={s.requestPanel}><Text style={s.requestTitle}>EVERY DESTINATION NEEDS A RUNNER.</Text><Text style={s.requestBody}>Mission creation, pricing and dispatch will open here. We're establishing trusted handoff and verification standards before enabling live requests.</Text><Pressable accessibilityRole="button" onPress={() => setMode("discover")} style={s.secondary}><Text style={s.secondaryText}>EXPLORE THE NETWORK</Text></Pressable></View>}
        <View style={s.manifesto}><Text style={s.quote}>“</Text><Text style={s.manifestoText}>IT'S NOT ABOUT WHAT YOU'RE CARRYING. IT'S ABOUT GETTING IT THERE.</Text><Text style={s.manifestoSub}>EVERY MISSION HAS A DESTINATION. EVERY DESTINATION NEEDS A RUNNER.</Text></View>
        <View style={s.footer}><Text style={s.footerBrand}>RUNNER®</Text><Text style={s.footerCopy}>BUILT FOR THE ONES WHO MAKE IT HAPPEN.</Text><Text style={s.footerVersion}>FOUNDATION BUILD / 0.1.0</Text></View>
      </ScrollView>
    </SafeAreaView>
  );
}
const s = StyleSheet.create({
 safe:{flex:1,backgroundColor:C.bg},page:{paddingHorizontal:22,paddingBottom:36,maxWidth:1240,width:"100%",alignSelf:"center"},
 topbar:{minHeight:76,flexDirection:"row",alignItems:"center",justifyContent:"space-between",borderBottomWidth:1,borderBottomColor:C.border},topbarWide:{minHeight:88},
 wordmark:{flexDirection:"row",alignItems:"center",gap:11},mark:{width:26,height:26,borderWidth:2,borderColor:C.orange,transform:[{rotate:"45deg"}],alignItems:"center",justifyContent:"center"},markCut:{width:8,height:8,backgroundColor:C.orange},logo:{color:C.text,fontSize:20,fontWeight:"900",letterSpacing:3},orange:{color:C.orange},
 topRight:{flexDirection:"row",alignItems:"center",gap:16},status:{flexDirection:"row",alignItems:"center",gap:7},liveDot:{width:6,height:6,borderRadius:6,backgroundColor:C.green},statusText:{color:C.muted,fontSize:9,fontWeight:"800",letterSpacing:1.2},avatar:{width:34,height:34,borderRadius:17,backgroundColor:C.raised,alignItems:"center",justifyContent:"center",borderWidth:1,borderColor:C.border},avatarText:{color:C.text,fontWeight:"800"},
 hero:{paddingTop:48,paddingBottom:48,gap:36},heroWide:{flexDirection:"row",alignItems:"center",paddingTop:72,paddingBottom:76},heroCopy:{flex:1,gap:17},eyebrow:{color:C.orange,fontSize:10,fontWeight:"900",letterSpacing:2.4},headline:{color:C.text,fontSize:62,lineHeight:61,fontWeight:"900",letterSpacing:-2.5},subhead:{color:C.muted,fontSize:15,lineHeight:24,maxWidth:450},
 actions:{flexDirection:"row",flexWrap:"wrap",gap:10,marginTop:8},primary:{paddingHorizontal:18,paddingVertical:15,backgroundColor:C.orange,borderRadius:3},primaryText:{color:"#111",fontSize:10,fontWeight:"900",letterSpacing:1.1},secondary:{paddingHorizontal:18,paddingVertical:15,borderWidth:1,borderColor:C.border,borderRadius:3},secondaryText:{color:C.text,fontSize:10,fontWeight:"800",letterSpacing:1},
 heroPanel:{flex:1,minHeight:270,backgroundColor:C.surface,borderWidth:1,borderColor:C.border,padding:18,justifyContent:"space-between"},panelTop:{flexDirection:"row",justifyContent:"space-between"},panelLabel:{color:C.muted,fontSize:9,fontWeight:"800",letterSpacing:1.4},panelLive:{color:C.green,fontSize:9,fontWeight:"800"},routeVisual:{height:150,justifyContent:"center",marginHorizontal:20},routeLine:{position:"absolute",left:24,right:24,height:2,backgroundColor:C.orange,transform:[{rotate:"-12deg"}]},routePoint:{position:"absolute",width:20,height:20,borderRadius:10,borderWidth:1,borderColor:C.orange,alignItems:"center",justifyContent:"center",backgroundColor:C.surface},routeStart:{left:12,top:92},routeEnd:{right:10,top:34},routeCore:{width:6,height:6,borderRadius:3,backgroundColor:C.orange},routeTag:{alignSelf:"center",backgroundColor:C.orangeSoft,paddingHorizontal:10,paddingVertical:7},routeTagText:{color:C.orange,fontSize:8,fontWeight:"900",letterSpacing:1.4},
 panelBottom:{flexDirection:"row",gap:22,borderTopWidth:1,borderTopColor:C.border,paddingTop:16},metricValue:{color:C.text,fontSize:21,fontWeight:"900",letterSpacing:-0.5},metricLabel:{color:C.muted,fontSize:8,fontWeight:"800",letterSpacing:1,marginTop:4},metricDivider:{width:1,backgroundColor:C.border},
 sectionHeader:{flexDirection:"row",justifyContent:"space-between",alignItems:"flex-end",borderBottomWidth:1,borderBottomColor:C.border,paddingBottom:15,marginBottom:16},sectionTitle:{color:C.text,fontSize:23,fontWeight:"900",letterSpacing:-0.6,marginTop:7},sectionMeta:{color:C.muted,fontSize:8,fontWeight:"800",letterSpacing:1.1},
 missionGrid:{gap:12},missionGridWide:{flexDirection:"row"},missionCard:{flex:1,minWidth:0,backgroundColor:C.surface,borderWidth:1,borderColor:C.border,padding:17,borderRadius:4},missionCardSelected:{borderColor:C.orange},cardTop:{flexDirection:"row",justifyContent:"space-between",alignItems:"center"},cardType:{color:C.orange,fontSize:8,fontWeight:"900",letterSpacing:1.4},urgency:{color:C.muted,fontSize:8,fontWeight:"800",letterSpacing:0.8},urgencyPriority:{color:C.orange},missionTitle:{color:C.text,fontSize:19,fontWeight:"800",marginTop:17,marginBottom:18},
 locations:{flexDirection:"row",gap:12,minHeight:48},locationRail:{width:10,alignItems:"center",paddingTop:4,paddingBottom:4},locationDot:{width:7,height:7,borderRadius:4,backgroundColor:C.orange},locationDotEnd:{backgroundColor:C.text},locationStem:{flex:1,width:1,backgroundColor:C.border,marginVertical:3},locationText:{flex:1,justifyContent:"space-between"},locationName:{color:C.muted,fontSize:11,fontWeight:"600"},
 cardFooter:{borderTopWidth:1,borderTopColor:C.border,marginTop:18,paddingTop:14,flexDirection:"row",justifyContent:"space-between",alignItems:"flex-end"},distance:{color:C.text,fontSize:9,fontWeight:"800",letterSpacing:0.8},missionId:{color:C.muted,fontSize:8,marginTop:5,letterSpacing:0.8},rewardWrap:{alignItems:"flex-end"},reward:{color:C.text,fontSize:22,fontWeight:"900"},rewardLabel:{color:C.muted,fontSize:7,fontWeight:"800",letterSpacing:1,marginTop:3},selectedNote:{marginTop:14,paddingTop:12,borderTopWidth:1,borderTopColor:C.border},selectedNoteText:{color:C.orange,fontSize:8,fontWeight:"800",letterSpacing:0.7},
 requestPanel:{backgroundColor:C.surface,borderWidth:1,borderColor:C.border,padding:24,gap:15},requestTitle:{color:C.text,fontSize:21,fontWeight:"900"},requestBody:{color:C.muted,fontSize:13,lineHeight:21,maxWidth:650},
 manifesto:{marginTop:58,marginBottom:46,paddingVertical:28,paddingHorizontal:22,borderTopWidth:1,borderBottomWidth:1,borderColor:C.border,alignItems:"center"},quote:{color:C.orange,fontSize:48,lineHeight:48,fontWeight:"900"},manifestoText:{color:C.text,textAlign:"center",fontSize:21,lineHeight:29,fontWeight:"900",letterSpacing:0.3,maxWidth:650},manifestoSub:{color:C.orange,textAlign:"center",fontSize:8,fontWeight:"900",letterSpacing:1.4,marginTop:16,lineHeight:14},
 footer:{flexDirection:"row",flexWrap:"wrap",alignItems:"center",justifyContent:"space-between",gap:10},footerBrand:{color:C.text,fontSize:11,fontWeight:"900",letterSpacing:2},footerCopy:{color:C.muted,fontSize:8,fontWeight:"800",letterSpacing:1},footerVersion:{color:C.muted,fontSize:8,letterSpacing:1}
});
